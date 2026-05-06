"use client";

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
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

function FaqCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative isolate">
      <div
        className="pointer-events-none absolute inset-0 rounded-lg bg-zinc-900"
        style={{ transform: "translate(5px,5px)" }}
        aria-hidden
      />
      <div className="relative rounded-lg border-2 border-zinc-900 bg-white p-5">
        <h3 className="m-0 mb-2 text-[15px] font-bold text-zinc-900">{title}</h3>
        <p className="m-0 text-sm leading-relaxed text-zinc-600">{children}</p>
      </div>
    </div>
  );
}

type FeatureRowProps = {
  title: string;
  description: string;
};

function FeatureRow({ title, description }: FeatureRowProps) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <IconCheck size={16} />
      </div>
      <div>
        <div className="text-[15px] font-bold text-zinc-900">{title}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{description}</p>
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
      <div className="mx-auto max-w-4xl px-6 pb-8 pt-12 text-center sm:px-8 sm:pt-16 md:pb-12">
        <h1 className="m-0 text-[clamp(2.125rem,6.5vw,3.75rem)] font-extrabold leading-none tracking-tight text-zinc-900">
          Steal more.
          <br />
          Build faster.
        </h1>
        <p className="mx-auto mb-8 mt-4 max-w-[520px] text-lg text-zinc-600">
          Unlock unlimited deep analysis, manual control, and more to reverse engineer
          any codebase.
        </p>
      </div>

      {/* Pricing card */}
      <div className="mx-auto max-w-[520px] px-6 pb-12 sm:px-8">
        <div className="relative isolate">
          <div
            className="pointer-events-none absolute inset-0 rounded-xl bg-zinc-900"
            style={{ transform: "translate(8px,8px)" }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-6 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-8">
            <div>
              <div className="mb-2 text-sm font-semibold tracking-wide text-zinc-600">
                MONTHLY PLAN
              </div>
              <div className="text-5xl font-extrabold tracking-tight sm:text-[48px]">
                $9
                <span className="text-xl font-semibold text-zinc-500">/mo</span>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 border-y-2 border-zinc-900 py-6">
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
                  style={{ transform: "translate(4px,4px)" }}
                  aria-hidden
                />
                <button
                  type="button"
                  disabled={ctaDisabled}
                  onClick={() => void handleSubscribe()}
                  className="relative z-10 w-full cursor-pointer rounded-md border-[3px] border-zinc-900 bg-[#d31611] px-6 py-3.5 font-bold text-white transition-transform duration-100 enabled:hover:-translate-x-px enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
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

      {/* FAQ */}
      <div className="mx-auto max-w-[672px] px-6 pb-16 pt-8 sm:px-8 md:px-12">
        <h2 className="m-0 mb-8 text-center text-[28px] font-extrabold tracking-tight sm:text-[32px]">
          Questions?
        </h2>
        <div className="flex flex-col gap-4">
          <FaqCard title="Can I cancel anytime?">
            Yes. Cancel your subscription at any time, no questions asked. You&apos;ll
            keep access through the end of your billing period.
          </FaqCard>
          <FaqCard title="Is there a free trial?">
            Yes — sign in with GitHub and get 5 free deep reverses every month. No credit
            card needed.
          </FaqCard>
          <FaqCard title="What payment methods do you accept?">
            We accept all major credit cards through Stripe. More payment methods coming
            soon.
          </FaqCard>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-zinc-200 px-6 py-6 text-center text-sm text-zinc-500">
        <Link
          href="https://discord.gg/Uq7fTGsQX"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900"
        >
          Discord
        </Link>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={handleAuthModalClose} />
    </div>
  );
}
