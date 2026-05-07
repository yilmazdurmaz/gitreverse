import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkActiveSubscriber } from "@/lib/subscriber";
import { SUBSCRIBER_EMAIL_HEADER } from "@/lib/subscriber-constants";

const MONTHLY_LIMIT = 1;
const RATE_LIMIT_RPC_TIMEOUT_MS = 2500;

/** Skip DB-backed limits while developing locally or when explicitly opted out. */
function shouldSkipCustomReverseRateLimit(req: NextRequest): boolean {
  if (process.env.GITREVERSE_SKIP_CUSTOM_REVERSE_RATE_LIMIT === "true") {
    return true;
  }
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const t = m?.[1]?.trim();
  return t || null;
}

/** Read `sub` from Supabase JWT payload (local base64url decode, no network). */
function extractUserIdFromJwtPayload(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const raw = parts[1];
    if (!raw) return null;
    const payload = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf-8")
    ) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Enforce monthly per-user limits for non-cached custom reverse. Returns a 429
 * response when over limit; returns `null` to continue (including fail-open on
 * missing token, timeout/DB errors). */
export async function enforceCustomReverseRateLimit(
  req: NextRequest
): Promise<NextResponse | null> {
  if (shouldSkipCustomReverseRateLimit(req)) {
    return null;
  }

  const subscriberEmail = req.headers.get(SUBSCRIBER_EMAIL_HEADER)?.trim();
  if (subscriberEmail) {
    const active = await checkActiveSubscriber(subscriberEmail);
    if (active === true) {
      return null;
    }
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  const token = getBearerToken(req);
  const userId = token ? extractUserIdFromJwtPayload(token) : null;
  if (!userId) {
    return null;
  }

  try {
    const rpcPromise = supabase.rpc("check_and_increment_user_usage", {
      p_user_id: userId,
      p_limit: MONTHLY_LIMIT,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("rl-timeout")), RATE_LIMIT_RPC_TIMEOUT_MS)
    );
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
    if (error) {
      console.warn("[custom-reverse] rate limit RPC error:", error.message);
      return null;
    }
    const payload = data as { allowed?: unknown } | null;
    const allowed =
      payload != null &&
      typeof payload === "object" &&
      payload.allowed === true;
    if (!allowed) {
      return NextResponse.json(
        {
          error: "monthly_limit_reached",
          remaining: 0,
        },
        { status: 429 }
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message !== "rl-timeout") {
      console.warn("[custom-reverse] rate limit:", e.message);
    }
    // Timeout or network — fail open
  }
  return null;
}
