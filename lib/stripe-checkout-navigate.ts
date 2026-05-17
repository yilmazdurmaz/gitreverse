/**
 * Client-side Stripe checkout redirect (premium page + in-app upgrade CTAs).
 */

const PENDING_REDIRECT_KEY = "gr_pending_redirect";
const CHECKOUT_NAVIGATION_STATE_KEY = "gr_checkout_navigation_state";

export const PAYMENT_LINK =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim()) ||
  "";

export function saveReturnPath(): void {
  if (typeof window === "undefined") return;
  try {
    if (!localStorage.getItem(PENDING_REDIRECT_KEY)) {
      localStorage.setItem(PENDING_REDIRECT_KEY, window.location.pathname);
    }
  } catch {
    /* storage unavailable */
  }
}

function savePendingRedirect(): void {
  // Only saves if nothing was pre-saved (e.g. from a "Get Unlimited" click)
  saveReturnPath();
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
