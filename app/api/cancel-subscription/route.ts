import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

const REASON_MIN_LEN = 10;

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "Authorization header required" },
      { status: 401 }
    );
  }

  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    return NextResponse.json(
      { error: "supabase_not_configured", message: "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing" },
      { status: 503 }
    );
  }

  const supabaseAuth = createClient(url, publishableKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(token);

  if (userError || !user?.id || !user.email?.trim()) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reason =
    typeof body === "object" &&
    body !== null &&
    "cancellation_reason" in body &&
    typeof (body as { cancellation_reason: unknown }).cancellation_reason ===
      "string"
      ? (body as { cancellation_reason: string }).cancellation_reason.trim()
      : "";

  if (reason.length < REASON_MIN_LEN) {
    return NextResponse.json(
      {
        error: `Cancellation reason must be at least ${REASON_MIN_LEN} characters`,
      },
      { status: 400 }
    );
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      {
        error: "stripe_not_configured",
        message: "STRIPE_SECRET_KEY is not set",
      },
      { status: 503 }
    );
  }

  try {
    const customers = await stripe.customers.list({
      email: user.email.trim(),
      limit: 1,
    });
    const customerId = customers.data[0]?.id;
    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for this account" },
        { status: 400 }
      );
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const canceledIds: string[] = [];
    for (const sub of subscriptions.data) {
      const canceled = await stripe.subscriptions.cancel(sub.id);
      canceledIds.push(canceled.id);
    }

    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { error: insertError } = await userClient
      .from("subscription_cancellations")
      .insert({
        user_id: user.id,
        cancellation_reason: reason,
        stripe_customer_id: customerId,
        stripe_subscription_ids: canceledIds,
        canceled_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("[cancel-subscription] feedback insert:", insertError.message);
      // Subscription is already canceled; match edge-function behavior — do not fail the request.
    }

    return NextResponse.json({
      success: true,
      canceled_subscription_ids: canceledIds,
    });
  } catch (err) {
    console.error("[cancel-subscription]", err);
    return NextResponse.json(
      {
        error: "cancel_failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
