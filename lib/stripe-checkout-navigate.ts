/**
 * Client-side Stripe checkout redirect (shared by home + nav Premium button).
 */

const PENDING_REDIRECT_KEY = "gr_pending_redirect";
const CHECKOUT_NAVIGATION_STATE_KEY = "gr_checkout_navigation_state";

export const PAYMENT_LINK =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim()) ||
  "";

function savePendingRedirect(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_REDIRECT_KEY, window.location.pathname);
  } catch {
    /* storage unavailable */
  }
}

export async function beginStripeCheckout(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!PAYMENT_LINK) return;
  savePendingRedirect();
  try {
    const res = await fetch("/api/create-checkout", {
      method: "POST",
    });
    const data = (await res.json()) as { url?: string };
    if (!res.ok || !data.url) {
      throw new Error("checkout_unavailable");
    }
    try {
      sessionStorage.setItem(CHECKOUT_NAVIGATION_STATE_KEY, "started");
    } catch {
      /* ignore */
    }
    window.location.href = data.url;
  } catch {
    try {
      sessionStorage.setItem(CHECKOUT_NAVIGATION_STATE_KEY, "started");
    } catch {
      /* ignore */
    }
    window.location.href = PAYMENT_LINK;
  }
}
