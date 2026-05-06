"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/contexts/AuthContext";
import { beginStripeCheckout, PAYMENT_LINK } from "@/lib/stripe-checkout-navigate";

const SUBSCRIBER_EMAIL_KEY = "gr_subscriber_email";

function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d31611"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

type FeatureRowProps = {
  title: string;
  description: string;
};

function FeatureRow({ title, description }: FeatureRowProps) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <IconCheck size={14} />
      </div>
      <div>
        <div className="text-sm font-bold text-zinc-900">{title}</div>
        <p className="mt-0 text-xs leading-snug text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

export function PremiumPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [subscriberFromStorage, setSubscriberFromStorage] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      try {
        const v = localStorage.getItem(SUBSCRIBER_EMAIL_KEY);
        setSubscriberFromStorage(Boolean(v?.trim()));
      } catch {
        setSubscriberFromStorage(false);
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  useEffect(() => {
    if (!pendingCheckout || !isAuthenticated || authLoading) return;
    setPendingCheckout(false);
    setShowAuthModal(false);
    if (!PAYMENT_LINK.trim()) return;
    setCheckoutBusy(true);
    void beginStripeCheckout().finally(() => {
      setCheckoutBusy(false);
    });
  }, [pendingCheckout, isAuthenticated, authLoading]);

  const handleAuthModalClose = useCallback(() => {
    setShowAuthModal(false);
    setPendingCheckout(false);
  }, []);

  const handleSubscribe = useCallback(() => {
    if (subscriberFromStorage) return;
    if (authLoading) return;
    if (!PAYMENT_LINK.trim()) return;
    if (!isAuthenticated) {
      setPendingCheckout(true);
      setShowAuthModal(true);
      return;
    }
    setCheckoutBusy(true);
    void beginStripeCheckout().finally(() => {
      setCheckoutBusy(false);
    });
  }, [subscriberFromStorage, authLoading, isAuthenticated]);

  const isSubscriber = subscriberFromStorage === true;
  const ctaDisabled =
    checkoutBusy ||
    authLoading ||
    !PAYMENT_LINK.trim() ||
    isSubscriber;

  const ctaLabel = (() => {
    if (isSubscriber) return "You’re already on Premium";
    if (!PAYMENT_LINK.trim()) return "Checkout unavailable";
    if (checkoutBusy) return "Processing…";
    if (authLoading) return "…";
    return "Subscribe Now";
  })();

  return (
    <div className="min-h-[100vh] bg-[#fffdf8] text-zinc-900">
      <Navbar />

      {/* Hero */}
      <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-3 pt-12 text-center sm:px-8 sm:pt-16 md:pb-4">
        <h1 className="m-0 max-w-[100%] text-center text-[clamp(0.9375rem,calc(0.65rem+3.85vw),3.75rem)] font-extrabold leading-none tracking-tight text-zinc-900 whitespace-nowrap">
          Steal more. Build faster.
        </h1>
      </div>

      {/* Pricing card */}
      <div className="mx-auto max-w-[440px] px-6 pb-12 sm:px-8">
        <div className="relative isolate">
          <div
            className="pointer-events-none absolute inset-0 rounded-lg bg-zinc-900"
            style={{ transform: "translate(5px,5px)" }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-3.5 rounded-lg border-[2.5px] border-zinc-900 bg-[#fff4da] p-5 sm:p-6">
            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-zinc-600">
                MONTHLY PLAN
              </div>
              <div className="text-4xl font-extrabold tracking-tight sm:text-[2.5rem]">
                $9
                <span className="text-base font-semibold text-zinc-500 sm:text-lg">/mo</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-y border-zinc-900 py-3.5">
              <FeatureRow
                title="Unlimited deep reverse"
                description="Analyze projects of any size, no limits on request depth or complexity."
              />
              <FeatureRow
                title="Unlimited manual control"
                description="Fine-tune prompts, focus on specific features, and customize analysis exactly how you want."
              />
              <FeatureRow
                title="No monthly limits"
                description="Reverse as many repos as you want, as deep as you want."
              />
            </div>

            <div>
              <span className="relative isolate block">
                <span
                  className="pointer-events-none absolute inset-0 rounded-md bg-zinc-900"
                  style={{ transform: "translate(3px,3px)" }}
                  aria-hidden
                />
                <button
                  type="button"
                  disabled={ctaDisabled}
                  onClick={() => void handleSubscribe()}
                  className="relative z-10 w-full cursor-pointer rounded-md border-[2.5px] border-zinc-900 bg-[#d31611] px-4 py-2.5 text-sm font-bold text-white transition-transform duration-100 enabled:hover:-translate-x-px enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:text-base"
                >
                  {ctaLabel}
                </button>
              </span>
            </div>

            <p className="m-0 text-center text-xs leading-relaxed text-zinc-500">
              Cancel anytime. No hidden fees.
            </p>
          </div>
        </div>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={handleAuthModalClose} />
    </div>
  );
}
