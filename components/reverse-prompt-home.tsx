"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { AuthModal } from "@/components/auth/AuthModal";
import { Navbar } from "@/components/navbar";
import { ReverseGenerationFlavorText } from "@/components/reverse-generation-flavor-text";
import { useAuth } from "@/contexts/AuthContext";
import { HOME_EXAMPLES } from "@/lib/home-example-repos";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";
import { PAYMENT_LINK } from "@/lib/stripe-checkout-navigate";
import { SUBSCRIBER_EMAIL_HEADER } from "@/lib/subscriber-constants";

const GITREVERSE_HISTORY_KEY = "gitreverse_history";
const GITREVERSE_HISTORY_MAX = 20;
const HISTORY_PROMPT_PREVIEW_LEN = 160;

const RL_KEY_MONTHLY = "gr_rl_monthly";
const MONTHLY_CUSTOM_LIMIT = 1;
const SUBSCRIBER_EMAIL_KEY = "gr_subscriber_email";
const PENDING_REDIRECT_KEY = "gr_pending_redirect";
const CHECKOUT_NAVIGATION_STATE_KEY = "gr_checkout_navigation_state";
const CHECKOUT_RETURNED_STATE = "returned";

const PENDING_AUTH_KEY = "gr_pending_auth_action";

type PendingAuthAction =
  | { type: "deep"; repoUrl: string }
  | { type: "manual"; repoUrl: string; focus: string };

function savePendingAuth(action: PendingAuthAction): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(action));
  } catch {
    /* storage unavailable */
  }
}

function clearPendingAuth(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_AUTH_KEY);
  } catch {
    /* storage unavailable */
  }
}

const CHECKOUT_ABANDONMENT_OPTIONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_ready_yet", label: "Not ready yet" },
  { value: "just_browsing", label: "Just browsing" },
  { value: "other", label: "Other" },
] as const;

type CheckoutAbandonmentReason =
  (typeof CHECKOUT_ABANDONMENT_OPTIONS)[number]["value"];

function clearCheckoutNavigationState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CHECKOUT_NAVIGATION_STATE_KEY);
  } catch {
    /* storage unavailable */
  }
}

type RLEntry = { count: number; date: string };

/** Calendar month key for combined deep+manual quota (UTC `YYYY-MM`). */
function getMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

function getRLEntry(key: string): RLEntry {
  if (typeof window === "undefined")
    return { count: 0, date: getMonthStr() };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { count: 0, date: getMonthStr() };
    const e = JSON.parse(raw) as RLEntry;
    return e.date === getMonthStr() ? e : { count: 0, date: getMonthStr() };
  } catch {
    return { count: 0, date: getMonthStr() };
  }
}

function incrementRLEntry(key: string): void {
  if (typeof window === "undefined") return;
  const e = getRLEntry(key);
  localStorage.setItem(
    key,
    JSON.stringify({ count: e.count + 1, date: e.date })
  );
}

function historyPromptPreview(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= HISTORY_PROMPT_PREVIEW_LEN) return t;
  return `${t.slice(0, HISTORY_PROMPT_PREVIEW_LEN).trimEnd()}…`;
}

/** Stable row id: `quick`, `deep`, or `m:${trimmedFocus}` (manual). */
function historySlotOf(e: { historySlot?: string }): string {
  return e.historySlot ?? "quick";
}

function historySlotFromProps(
  preserveUrl: boolean,
  autoSubmitDeep: boolean,
  autoSubmitFocus: string | undefined,
  initialManualFocus: string | undefined,
  initialGenerationKind: "quick" | "deep" | "manual" | undefined
): string {
  if (preserveUrl) {
    if (autoSubmitDeep || initialGenerationKind === "deep") return "deep";
    const focus =
      (autoSubmitFocus?.trim() || initialManualFocus?.trim()) ?? "";
    if (initialGenerationKind === "manual" || focus) {
      return `m:${focus}`;
    }
  }
  return "quick";
}

function historySlotFromGenerationState(
  kind: "quick" | "deep" | "manual" | null,
  manualFocus: string | null
): string | null {
  if (kind == null) return null;
  if (kind === "deep") return "deep";
  if (kind === "manual") return `m:${manualFocus?.trim() ?? ""}`;
  return "quick";
}

type GitreverseHistoryEntry = {
  owner: string;
  repo: string;
  visitedAt: string;
  /** Distinguishes quick vs deep vs manual rows for the same repo. */
  historySlot?: string;
  promptPreview?: string;
  lastGenerationType?: "quick" | "deep" | "manual";
  lastManualFocus?: string;
};

type ReversePromptHomeProps = {
  initialRepoInput?: string;
  autoSubmit?: boolean;
  initialPrompt?: string;
  owner?: string;
  repo?: string;
  /** Auto-run Deep Reverse on mount (shareable `/owner/repo/deep`). */
  autoSubmitDeep?: boolean;
  /** Auto-run manual control with this focus on mount (shareable `/owner/repo/<focus>`). */
  autoSubmitFocus?: string;
  /** When true, do not rewrite the URL to `/:owner/:repo` after generation. */
  preserveUrl?: boolean;
  /** When SSR provides a cached prompt, record how it was produced for history. */
  initialGenerationKind?: "quick" | "deep" | "manual";
  initialManualFocus?: string;
  isHome?: boolean;
};

export function ReversePromptHome({
  initialRepoInput = "",
  autoSubmit = false,
  initialPrompt,
  owner,
  repo,
  autoSubmitDeep = false,
  autoSubmitFocus,
  preserveUrl = false,
  initialGenerationKind,
  initialManualFocus,
  isHome = false,
}: ReversePromptHomeProps) {
  const router = useRouter();
  const { isAuthenticated, session } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const openAuthModalWithPending = useCallback((action: PendingAuthAction) => {
    savePendingAuth(action);
    setShowAuthModal(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    clearPendingAuth();
    setShowAuthModal(false);
  }, []);

  const initialFocus =
    autoSubmitDeep
      ? ""
      : (autoSubmitFocus?.trim() || initialManualFocus?.trim()) ?? "";
  const [repoUrl, setRepoUrl] = useState(initialRepoInput);
  const [customReverse, setCustomReverse] = useState(Boolean(initialFocus));
  const [customPrompt, setCustomPrompt] = useState(initialFocus);
  /** Hides “Deep Reverse” after a custom or deep run (not needed for that result). */
  const [lastResultWasCustom, setLastResultWasCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [monthlyLimitReached, setMonthlyLimitReached] = useState(false);
  const [subscriberEmail, setSubscriberEmail] = useState<string | null>(null);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subscriberHydrated, setSubscriberHydrated] = useState(false);
  const [checkoutVerifyState, setCheckoutVerifyState] = useState<
    "idle" | "verifying" | "still_processing"
  >("idle");
  const [showAbandonmentSurvey, setShowAbandonmentSurvey] = useState(false);
  const [abandonmentOtherText, setAbandonmentOtherText] = useState("");
  const [abandonmentShowOther, setAbandonmentShowOther] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [copied, setCopied] = useState(false);
  /** Live line for manual/deep (SSE or cache); empty when idle. */
  const [manualStatusLine, setManualStatusLine] = useState("");
  /**
   * Which request is in flight. Deep Reverse uses `runCustomReverse` without
   * the Manual control checkbox, so we cannot key off `customReverse` alone.
   */
  const [loadKind, setLoadKind] = useState<"none" | "quick" | "custom">("none");
  const [lastGenerationKind, setLastGenerationKind] = useState<
    "quick" | "deep" | "manual" | null
  >(() => initialGenerationKind ?? null);
  const [lastManualFocus, setLastManualFocus] = useState<string | null>(() =>
    initialManualFocus?.trim() ? initialManualFocus.trim() : null
  );
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const autoSubmitStartedRef = useRef(false);

  /** Open Manual control and fill the focus when the URL (or SSR) carries a manual focus segment. */
  useEffect(() => {
    if (autoSubmitDeep) {
      setCustomReverse(false);
      return;
    }
    const focus =
      (autoSubmitFocus?.trim() || initialManualFocus?.trim()) ?? "";
    if (!initialRepoInput?.trim()) {
      if (focus) {
        setCustomReverse(true);
        setCustomPrompt(focus);
      }
      return;
    }
    if (focus) {
      setCustomReverse(true);
      setCustomPrompt(focus);
    } else {
      setCustomReverse(false);
    }
  }, [autoSubmitDeep, autoSubmitFocus, initialManualFocus, initialRepoInput]);

  /** After interrupted checkout reload, layout script sets sessionStorage to `returned`. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (
        sessionStorage.getItem(CHECKOUT_NAVIGATION_STATE_KEY) ===
        CHECKOUT_RETURNED_STATE
      ) {
        sessionStorage.removeItem(CHECKOUT_NAVIGATION_STATE_KEY);
        setShowAbandonmentSurvey(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  /** Stripe Payment Link return URL + restore subscriber from localStorage. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    async function hydrateSubscriber() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id")?.trim();

      if (!sessionId) {
        localStorage.removeItem(PENDING_REDIRECT_KEY);
      }

      if (sessionId) {
        setCheckoutVerifyState("verifying");
        try {
          const res = await fetch(
            `/api/verify-subscription?session_id=${encodeURIComponent(sessionId)}`
          );
          const data = (await res.json()) as { email?: string; error?: string };
          if (cancelled) return;
          if (res.ok && typeof data.email === "string" && data.email) {
            clearCheckoutNavigationState();
            localStorage.setItem(SUBSCRIBER_EMAIL_KEY, data.email);
            setSubscriberEmail(data.email);
            setIsSubscriber(true);
            setMonthlyLimitReached(false);
            setCheckoutVerifyState("idle");
            const pendingRedirect = localStorage.getItem(PENDING_REDIRECT_KEY);
            localStorage.removeItem(PENDING_REDIRECT_KEY);
            if (pendingRedirect) {
              void router.push(pendingRedirect);
            } else {
              window.history.replaceState(null, "", window.location.pathname);
            }
          } else {
            setCheckoutVerifyState("still_processing");
          }
        } catch {
          if (!cancelled) setCheckoutVerifyState("still_processing");
        }
        if (!cancelled) setSubscriberHydrated(true);
        return;
      }

      const stored = localStorage.getItem(SUBSCRIBER_EMAIL_KEY)?.trim();
      if (stored) {
        try {
          const res = await fetch(
            `/api/check-subscription?email=${encodeURIComponent(stored)}`
          );
          const data = (await res.json()) as { subscribed?: boolean };
          if (cancelled) return;
          if (data.subscribed) {
            setSubscriberEmail(stored);
            setIsSubscriber(true);
          } else {
            localStorage.removeItem(SUBSCRIBER_EMAIL_KEY);
            setSubscriberEmail(null);
            setIsSubscriber(false);
          }
        } catch {
          if (!cancelled) {
            setSubscriberEmail(null);
            setIsSubscriber(false);
          }
        }
      }
      if (!cancelled) setSubscriberHydrated(true);
    }

    void hydrateSubscriber();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /** Close auth modal after successful sign-in (popup flow). */
  useEffect(() => {
    if (isAuthenticated && showAuthModal) {
      setShowAuthModal(false);
    }
  }, [isAuthenticated, showAuthModal]);

  const runReversePrompt = useCallback(async (input: string) => {
    setError(null);
    setRateLimited(false);
    setPrompt("");
    setCopied(false);
    setLoadKind("quick");
    setLoading(true);
    try {
      const res = await fetch("/api/reverse-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: input }),
      });
      const data = (await res.json()) as {
        prompt?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      if (typeof data.prompt === "string") {
        setPrompt(data.prompt);
        setLastResultWasCustom(false);
        setLastGenerationKind("quick");
        setLastManualFocus(null);
        const parsed = parseGitHubRepoInput(input);
        if (parsed && typeof window !== "undefined" && !preserveUrl) {
          window.history.replaceState(
            null,
            "",
            `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
          );
        }
      } else {
        setError("No prompt in response.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
      setLoadKind("none");
    }
  }, [preserveUrl]);

  const runCustomReverse = useCallback(
    async (input: string, focusOrDeep: string | { mode: "deep" }) => {
      setError(null);
      setRateLimited(false);
      setMonthlyLimitReached(false);
      setPrompt("");
      setCopied(false);
      const isDeep =
        typeof focusOrDeep === "object" && focusOrDeep.mode === "deep";
      const bypassQuota = Boolean(isSubscriber && subscriberEmail?.trim());
      if (
        !bypassQuota &&
        getRLEntry(RL_KEY_MONTHLY).count >= MONTHLY_CUSTOM_LIMIT
      ) {
        setMonthlyLimitReached(true);
        return;
      }
      setManualStatusLine("Checking if it's cached…");
      setLoadKind("custom");
      setLoading(true);
      try {
        const bodyObj = isDeep
          ? { repoUrl: input, mode: "deep" as const, stream: true as const }
          : {
              repoUrl: input,
              customPrompt: focusOrDeep as string,
              stream: true as const,
            };

        const res = await fetch("/api/custom-reverse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
            ...(subscriberEmail
              ? { [SUBSCRIBER_EMAIL_HEADER]: subscriberEmail }
              : {}),
          },
          body: JSON.stringify(bodyObj),
        });

        const ct = res.headers.get("content-type") ?? "";

        if (ct.includes("application/json")) {
          const data = (await res.json()) as {
            prompt?: string;
            error?: string;
            fromCache?: boolean;
          };
          if (!res.ok) {
            if (res.status === 429) {
              const limitErr =
                data.error === "monthly_limit_reached" ||
                data.error === "daily_limit_reached";
              if (limitErr) {
                if (typeof window !== "undefined") {
                  localStorage.setItem(
                    RL_KEY_MONTHLY,
                    JSON.stringify({
                      count: MONTHLY_CUSTOM_LIMIT,
                      date: getMonthStr(),
                    })
                  );
                }
                setMonthlyLimitReached(true);
              } else {
                setRateLimited(true);
              }
              return;
            }
            setError(data.error ?? `Request failed (${res.status})`);
            return;
          }
          if (typeof data.prompt === "string") {
            if (data.fromCache) {
              setManualStatusLine("Loaded from cache");
              await new Promise((r) => setTimeout(r, 450));
            } else if (typeof window !== "undefined" && !bypassQuota) {
              incrementRLEntry(RL_KEY_MONTHLY);
            }
            setPrompt(data.prompt);
            setLastResultWasCustom(true);
            if (isDeep) {
              setLastGenerationKind("deep");
              setLastManualFocus(null);
            } else {
              setLastGenerationKind("manual");
              setLastManualFocus(String(focusOrDeep as string).trim());
            }
            const parsed = parseGitHubRepoInput(input);
            if (parsed && typeof window !== "undefined") {
              if (!isDeep) {
                const f = String(focusOrDeep as string).trim();
                window.history.replaceState(
                  null,
                  "",
                  f
                    ? `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(f)}`
                    : `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
                );
              } else if (!preserveUrl) {
                window.history.replaceState(
                  null,
                  "",
                  `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
                );
              }
            }
          } else {
            setError("No prompt in response.");
          }
          return;
        }

        if (!res.ok) {
          try {
            const errData = (await res.json()) as { error?: string };
            if (res.status === 429) {
              const limitErr =
                errData.error === "monthly_limit_reached" ||
                errData.error === "daily_limit_reached";
              if (limitErr) {
                if (typeof window !== "undefined") {
                  localStorage.setItem(
                    RL_KEY_MONTHLY,
                    JSON.stringify({
                      count: MONTHLY_CUSTOM_LIMIT,
                      date: getMonthStr(),
                    })
                  );
                }
                setMonthlyLimitReached(true);
              } else {
                setRateLimited(true);
              }
            } else {
              setError(errData.error ?? `Request failed (${res.status})`);
            }
          } catch {
            if (res.status === 429) {
              setRateLimited(true);
            } else {
              setError(`Request failed (${res.status})`);
            }
          }
          return;
        }

        if (!res.body) {
          setError("No response body from manual control.");
          return;
        }

        if (typeof window !== "undefined" && !bypassQuota) {
          incrementRLEntry(RL_KEY_MONTHLY);
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          for (;;) {
            const idx = buffer.indexOf("\n\n");
            if (idx < 0) break;
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let event = "message";
            let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) {
                event = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataStr = line.slice(5).trim();
              }
            }
            if (!dataStr) continue;
            try {
              if (event === "status") {
                const j = JSON.parse(dataStr) as { message?: string };
                if (typeof j.message === "string" && j.message) {
                  setManualStatusLine(j.message);
                }
              } else if (event === "done") {
                const j = JSON.parse(dataStr) as { prompt?: string };
                if (typeof j.prompt === "string") {
                  setPrompt(j.prompt);
                  setLastResultWasCustom(true);
                  if (isDeep) {
                    setLastGenerationKind("deep");
                    setLastManualFocus(null);
                  } else {
                    setLastGenerationKind("manual");
                    setLastManualFocus(String(focusOrDeep as string).trim());
                  }
                  const parsed = parseGitHubRepoInput(input);
                  if (parsed && typeof window !== "undefined") {
                    if (!isDeep) {
                      const f = String(focusOrDeep as string).trim();
                      window.history.replaceState(
                        null,
                        "",
                        f
                          ? `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(f)}`
                          : `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
                      );
                    } else if (!preserveUrl) {
                      window.history.replaceState(
                        null,
                        "",
                        `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
                      );
                    }
                  }
                } else {
                  setError("No prompt in response.");
                }
              } else if (event === "error") {
                const j = JSON.parse(dataStr) as { error?: string };
                setError(j.error ?? "Request failed");
              }
            } catch {
              // ignore malformed SSE chunk
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setLoading(false);
        setLoadKind("none");
        setManualStatusLine("");
      }
    },
    [preserveUrl, isSubscriber, subscriberEmail, session?.access_token]
  );

  const startDeepReverse = useCallback(() => {
    if (loading) return;
    const input = repoUrl.trim();
    const parsed = parseGitHubRepoInput(input);
    if (!parsed) return;
    if (!isAuthenticated) {
      openAuthModalWithPending({ type: "deep", repoUrl: input });
      return;
    }
    if (!initialRepoInput?.trim()) {
      void router.push(
        `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/deep`
      );
    } else {
      void runCustomReverse(input, { mode: "deep" });
    }
  }, [
    loading,
    repoUrl,
    isAuthenticated,
    initialRepoInput,
    router,
    runCustomReverse,
    openAuthModalWithPending,
  ]);

  /** Resume Deep / Manual after GitHub popup sign-in (sessionStorage). */
  useEffect(() => {
    if (!isAuthenticated) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_AUTH_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_AUTH_KEY);
    } catch {
      return;
    }
    let action: PendingAuthAction;
    try {
      action = JSON.parse(raw) as PendingAuthAction;
    } catch {
      return;
    }
    if (action.type === "deep") {
      void runCustomReverse(action.repoUrl, { mode: "deep" });
    } else if (action.type === "manual") {
      void runCustomReverse(action.repoUrl, action.focus);
    }
  }, [isAuthenticated, runCustomReverse]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = repoUrl.trim();

    if (!initialRepoInput?.trim()) {
      const parsed = parseGitHubRepoInput(trimmed);
      if (!parsed) return;
      if (customReverse) {
        const focus = customPrompt.trim();
        if (!isAuthenticated) {
          openAuthModalWithPending({
            type: "manual",
            repoUrl: trimmed,
            focus,
          });
          return;
        }
        void router.push(
          focus
            ? `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(focus)}`
            : `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
        );
      } else {
        void router.push(
          `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
        );
      }
      return;
    }

    if (customReverse) {
      const focus = customPrompt.trim();
      if (!isAuthenticated) {
        openAuthModalWithPending({
          type: "manual",
          repoUrl: trimmed,
          focus,
        });
        return;
      }
      const parsed = parseGitHubRepoInput(trimmed);
      if (parsed && typeof window !== "undefined") {
        window.history.pushState(
          null,
          "",
          focus
            ? `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(focus)}`
            : `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
        );
      }
      void runCustomReverse(trimmed, focus);
    } else {
      void runReversePrompt(trimmed);
    }
  }

  function onCustomReverseCheckboxChange(wantsOn: boolean) {
    setCustomReverse(wantsOn);
  }

  useEffect(() => {
    if (!subscriberHydrated) return;
    if (autoSubmitStartedRef.current) return;
    const trimmed = initialRepoInput?.trim() ?? "";
    if (!trimmed || !parseGitHubRepoInput(trimmed)) return;

    if (autoSubmitDeep) {
      if (!isAuthenticated) {
        setShowAuthModal(true);
        return;
      }
      autoSubmitStartedRef.current = true;
      void runCustomReverse(trimmed, { mode: "deep" });
      return;
    }
    const focus = autoSubmitFocus?.trim() ?? "";
    if (focus) {
      if (!isAuthenticated) {
        setShowAuthModal(true);
        return;
      }
      autoSubmitStartedRef.current = true;
      void runCustomReverse(trimmed, focus);
      return;
    }
    if (autoSubmit) {
      autoSubmitStartedRef.current = true;
      void runReversePrompt(trimmed);
    }
  }, [
    subscriberHydrated,
    autoSubmit,
    autoSubmitDeep,
    autoSubmitFocus,
    initialRepoInput,
    runCustomReverse,
    runReversePrompt,
    isAuthenticated,
  ]);

  /* `/owner/repo` uses quick auto-submit; `/owner/repo/deep` and `/owner/repo/<focus>` use the branches above. */

  useEffect(() => {
    if (typeof window === "undefined") return;
    const o = owner?.trim();
    const r = repo?.trim();
    if (!o || !r) return;

    /* Server-side dedupes by IP hash, so we no longer need a localStorage gate. */
    void fetch("/api/increment-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: o, repo: r }),
    }).catch(() => {
      /* swallow — view counter is best-effort */
    });
  }, [owner, repo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const o = owner?.trim();
    const r = repo?.trim();
    const p = prompt.trim();
    if (!o || !r || !p) return;

    const preview = historyPromptPreview(p);
    const raw = localStorage.getItem(GITREVERSE_HISTORY_KEY);
    let arr: GitreverseHistoryEntry[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        arr = Array.isArray(parsed) ? (parsed as GitreverseHistoryEntry[]) : [];
      } catch {
        return;
      }
    }
    const slot =
      historySlotFromGenerationState(lastGenerationKind, lastManualFocus) ??
      historySlotFromProps(
        preserveUrl,
        autoSubmitDeep,
        autoSubmitFocus,
        initialManualFocus,
        initialGenerationKind
      );

    const idx = arr.findIndex(
      (e) => e.owner === o && e.repo === r && historySlotOf(e) === slot
    );

    const gen = lastGenerationKind ?? undefined;
    const focusMeta =
      lastGenerationKind === "manual" && lastManualFocus?.trim()
        ? lastManualFocus.trim()
        : undefined;

    if (idx === -1) {
      arr.unshift({
        owner: o,
        repo: r,
        historySlot: slot,
        visitedAt: new Date().toISOString(),
        promptPreview: preview,
        ...(gen != null ? { lastGenerationType: gen } : {}),
        lastManualFocus: focusMeta,
      });
      localStorage.setItem(
        GITREVERSE_HISTORY_KEY,
        JSON.stringify(arr.slice(0, GITREVERSE_HISTORY_MAX))
      );
      return;
    }

    const cur = arr[idx];
    const samePreview = cur.promptPreview === preview;
    const sameGen = cur.lastGenerationType === gen;
    const sameFocus = cur.lastManualFocus === focusMeta;
    if (samePreview && sameGen && sameFocus) return;

    arr[idx] = {
      ...cur,
      historySlot: slot,
      promptPreview: preview,
      ...(gen != null ? { lastGenerationType: gen } : {}),
      lastManualFocus: focusMeta,
    };
    localStorage.setItem(GITREVERSE_HISTORY_KEY, JSON.stringify(arr));
  }, [
    owner,
    repo,
    prompt,
    lastGenerationKind,
    lastManualFocus,
    preserveUrl,
    autoSubmitDeep,
    autoSubmitFocus,
    initialManualFocus,
    initialGenerationKind,
  ]);

  useEffect(() => {
    if (!prompt) return;
    const id = requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [prompt]);

  const reverseEngineeredRepo = useMemo(
    () => (prompt ? parseGitHubRepoInput(repoUrl) : null),
    [prompt, repoUrl]
  );

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  function dismissAbandonmentSurvey() {
    setShowAbandonmentSurvey(false);
    setAbandonmentShowOther(false);
    setAbandonmentOtherText("");
  }

  function submitCheckoutAbandonmentReason(
    reason: CheckoutAbandonmentReason,
    otherText?: string
  ) {
    setShowAbandonmentSurvey(false);
    setAbandonmentShowOther(false);
    setAbandonmentOtherText("");
    void fetch("/api/checkout-abandonment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        ...(otherText?.trim() ? { other_text: otherText.trim() } : {}),
      }),
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar isSubscriber={isSubscriber} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        {checkoutVerifyState === "verifying" ? (
          <div
            className="w-full max-w-2xl rounded-lg border-[3px] border-zinc-400 bg-zinc-50 p-4 text-center text-sm text-zinc-800"
            role="status"
            aria-live="polite"
          >
            Confirming your subscription…
          </div>
        ) : null}
        {checkoutVerifyState === "still_processing" ? (
          <div
            className="w-full max-w-2xl rounded-lg border-[3px] border-amber-400 bg-amber-50 p-4"
            role="alert"
          >
            <p className="text-sm font-semibold text-amber-900">
              Payment is still syncing
            </p>
            <p className="mt-2 text-sm text-amber-800">
              Wait a few seconds and retry — we pull your email from Stripe as
              soon as it lands in the database.
            </p>
            <button
              type="button"
              onClick={async () => {
                const sid = new URLSearchParams(window.location.search)
                  .get("session_id")
                  ?.trim();
                if (!sid) return;
                setCheckoutVerifyState("verifying");
                try {
                  const res = await fetch(
                    `/api/verify-subscription?session_id=${encodeURIComponent(sid)}`
                  );
                  const data = (await res.json()) as { email?: string };
                  if (res.ok && typeof data.email === "string" && data.email) {
                    clearCheckoutNavigationState();
                    localStorage.setItem(SUBSCRIBER_EMAIL_KEY, data.email);
                    setSubscriberEmail(data.email);
                    setIsSubscriber(true);
                    setMonthlyLimitReached(false);
                    setCheckoutVerifyState("idle");
                    const pendingRedirect = localStorage.getItem(
                      PENDING_REDIRECT_KEY
                    );
                    localStorage.removeItem(PENDING_REDIRECT_KEY);
                    if (pendingRedirect) {
                      void router.push(pendingRedirect);
                    } else {
                      window.history.replaceState(
                        null,
                        "",
                        window.location.pathname
                      );
                    }
                  } else {
                    setCheckoutVerifyState("still_processing");
                  }
                } catch {
                  setCheckoutVerifyState("still_processing");
                }
              }}
              className="mt-3 rounded border-[2px] border-amber-700 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100"
            >
              Retry
            </button>
          </div>
        ) : null}
        <div className="flex w-full flex-col items-center gap-6">
          {isHome && (
            <div className="relative flex w-full flex-col items-center text-center">

              <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl lg:text-7xl">
                Steal any code and
                <br />
                make it your own
              </h1>
              <p className="mt-4 max-w-xl text-lg text-zinc-600">
                Reverse engineer a codebase into a prompt you can build from.
              </p>
            </div>
          )}
          <div className="flex w-full max-w-2xl flex-col gap-3">
          <div className="relative w-full">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <form
              onSubmit={onSubmit}
              className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <div className="relative min-w-0 flex-1">
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                    <input
                      name="repoUrl"
                      autoComplete="off"
                      className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                      placeholder="https://github.com/…"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      required
                    />
                  </div>
                  <div className="group relative w-full shrink-0 sm:w-auto">
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-800" />
                    <button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className={`relative z-10 flex w-full items-center justify-center gap-2 rounded border-[3px] border-zinc-900 px-6 py-3 font-medium text-white transition-transform group-hover:-translate-x-px group-hover:-translate-y-px disabled:pointer-events-none sm:min-w-[10rem] ${
                        loading ? "bg-[#b5120e]" : "bg-[#d31611]"
                      }`}
                    >
                      {loading ? (
                        <>
                          <svg
                            className="h-5 w-5 shrink-0 animate-spin text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Processing…</span>
                        </>
                      ) : (
                        "Get Prompt"
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2">
                  <label
                    className={`flex items-center gap-2 text-sm font-medium ${
                      loading
                        ? "cursor-not-allowed text-zinc-500"
                        : "cursor-pointer text-zinc-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[2px] border-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                      checked={customReverse}
                      disabled={loading}
                      onChange={(e) =>
                        onCustomReverseCheckboxChange(e.target.checked)
                      }
                    />
                    Manual control
                  </label>
                  {customReverse ? (
                    <div className="relative w-full">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                      <textarea
                        name="customPrompt"
                        rows={4}
                        className="relative z-10 w-full resize-y rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-80"
                        placeholder="repurpose into your own version, or focus on a specific feature"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        required={customReverse}
                        disabled={loading}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <div className="mt-4">
                  {loadKind === "custom" ? (
                    <p
                      className="min-h-[1.25rem] text-sm text-zinc-600"
                      role="status"
                      aria-live="polite"
                    >
                      {manualStatusLine}
                    </p>
                  ) : (
                    <ReverseGenerationFlavorText />
                  )}
                </div>
              ) : null}

              {monthlyLimitReached ? (
                <div
                  className="mt-4 rounded-lg border-[3px] border-zinc-400 bg-zinc-100 p-4"
                  role="alert"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-zinc-900">
                      You&apos;ve hit this month&apos;s limit.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {PAYMENT_LINK ? (
                        <Link
                          href="/premium"
                          className="inline-flex items-center justify-center rounded border-[2px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-[#ffbd5c]"
                        >
                          Get Unlimited
                        </Link>
                      ) : null}
                      <Link
                        href="/library"
                        className={`inline-flex items-center justify-center rounded border-[2px] px-3 py-1.5 text-sm font-semibold transition-colors ${
                          PAYMENT_LINK
                            ? "border-zinc-400 bg-white text-zinc-800 hover:bg-zinc-50"
                            : "border-zinc-800 bg-white text-zinc-900 hover:bg-zinc-50"
                        }`}
                      >
                        Browse Library
                      </Link>
                    </div>
                  </div>
                </div>
              ) : rateLimited ? (
                <div className="mt-4 rounded-lg border-[3px] border-amber-400 bg-amber-50 p-4" role="alert">
                  <p className="font-semibold text-amber-900">Sorry, we&apos;re a bit overwhelmed right now.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <p className="w-full text-sm text-amber-800">Come back in a couple of hours, or check out what others have already generated:</p>
                    <Link
                      href="/library"
                      className="inline-flex items-center justify-center rounded border-[2px] border-amber-600 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                    >
                      Browse the library
                    </Link>
                  </div>
                </div>
              ) : error ? (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {isHome && !loading && !customReverse ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="w-full text-sm text-zinc-600">
                    Try example repos:
                  </span>
                  {HOME_EXAMPLES.map(({ label, url }) => (
                    <div key={url} className="group relative">
                      <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                      <button
                        type="button"
                        onClick={() => setRepoUrl(url)}
                        className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#EBDBB7] px-3 py-1 text-sm font-medium text-zinc-900 transition-transform hover:bg-[#ffc480] group-hover:-translate-x-px group-hover:-translate-y-px"
                      >
                        {label}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </form>
          </div>
          {isHome && (
            <p className="text-center text-sm text-zinc-500">
              You can also replace{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
                hub
              </code>{" "}
              with{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
                reverse
              </code>{" "}
              in any GitHub URL.
            </p>
          )}
          </div>
        </div>

        {prompt ? (
          <div
            ref={resultsRef}
            data-results
            className="relative w-full max-w-2xl scroll-mt-24"
          >
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <section className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Reverse engineered prompt
                </h2>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {reverseEngineeredRepo ? (
                    <a
                      href={`https://github.com/${encodeURIComponent(reverseEngineeredRepo.owner)}/${encodeURIComponent(reverseEngineeredRepo.repo)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${reverseEngineeredRepo.owner}/${reverseEngineeredRepo.repo} on GitHub`}
                      className="group/gh relative inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
                    >
                      <span className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900 transition-transform group-hover/gh:translate-x-px group-hover/gh:translate-y-px" />
                      <span className="relative z-10 inline-flex items-center gap-1.5 rounded border-[3px] border-zinc-900 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors group-hover/gh:bg-zinc-50">
                        <svg
                          className="h-3.5 w-3.5 shrink-0"
                          viewBox="0 0 98 96"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.096-.08-9.211-13.588 2.963-16.424-5.867-16.424-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.613-10.839-1.22-22.229-5.412-22.229-24.054 0-5.312 1.895-9.718 5.424-13.126-.526-1.324-2.356-6.74.505-14.052 0 0 4.432-1.505 14.5 5.008 4.172-1.095 8.73-1.63 13.168-1.656 4.469.026 8.971.561 13.166 1.656 10.06-6.513 14.48-5.008 14.48-5.008 2.866 7.326 1.052 12.728.53 14.052 3.532 3.408 5.414 7.814 5.414 13.126 0 18.728-11.401 22.813-22.285 23.985 1.772 1.514 3.316 4.539 3.316 9.119 0 6.613-.08 11.898-.08 13.526 0 1.304.878 2.853 3.316 2.364C84.974 89.385 98 70.983 98 49.204 98 22 76.038 0 48.854 0z"
                            fill="currentColor"
                          />
                        </svg>
                        GitHub
                      </span>
                    </a>
                  ) : null}
                  <div className="group relative">
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                    <button
                      type="button"
                      onClick={copyPrompt}
                      className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-xs font-medium text-zinc-900 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="mb-2 mt-4 text-sm font-bold first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    code: ({ children }) => <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">{children}</code>,
                    pre: ({ children }) => <pre className="mb-2 overflow-auto rounded bg-zinc-100 p-3 font-mono text-xs">{children}</pre>,
                    hr: () => <hr className="my-3 border-zinc-200" />,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600">{children}</blockquote>,
                  }}
                >
                  {prompt}
                </ReactMarkdown>
              </div>
              {!lastResultWasCustom && !loading ? (
                <p className="mt-4 text-center text-sm text-zinc-600">
                  Want more depth?{" "}
                  <span
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer font-medium text-zinc-900 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-950"
                    onClick={() => {
                      startDeepReverse();
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      startDeepReverse();
                    }}
                  >
                    Deep Reverse
                  </span>
                </p>
              ) : null}
            </section>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6">
          <a
            href="https://github.com/filiksyos/gitreverse"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900"
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            GitHub
          </a>
          <span className="text-zinc-300" aria-hidden>
            ·
          </span>
          <a
            href="https://discord.gg/bhEMbZMHS"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900"
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Discord
          </a>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={closeAuthModal} />

      {showAbandonmentSurvey ? (
        <div
          className="fixed bottom-6 right-6 z-[60] w-[min(100vw-3rem,20rem)]"
          role="dialog"
          aria-labelledby="checkout-abandon-title"
          aria-modal="false"
        >
          <div className="relative">
            <div
              className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900"
              aria-hidden
            />
            <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-5">
              <div className="flex items-start justify-between gap-2">
                <h2
                  id="checkout-abandon-title"
                  className="pr-2 text-sm font-semibold leading-snug text-zinc-900"
                >
                  What stopped you from upgrading?
                </h2>
                <button
                  type="button"
                  onClick={dismissAbandonmentSurvey}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border-[2px] border-zinc-900 bg-white text-lg font-bold leading-none text-zinc-900 transition-colors hover:bg-[#ffc480]"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              {abandonmentShowOther ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="relative">
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                    <textarea
                      autoFocus
                      rows={3}
                      value={abandonmentOtherText}
                      onChange={(e) => setAbandonmentOtherText(e.target.value)}
                      placeholder="Tell us more…"
                      className="relative z-10 w-full resize-none rounded border-[2px] border-zinc-900 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        submitCheckoutAbandonmentReason(
                          "other",
                          abandonmentOtherText
                        )
                      }
                      className="rounded border-[2px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-[#ffbd5c]"
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbandonmentShowOther(false)}
                      className="rounded border-[2px] border-zinc-400 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {CHECKOUT_ABANDONMENT_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        value === "other"
                          ? setAbandonmentShowOther(true)
                          : submitCheckoutAbandonmentReason(value)
                      }
                      className="rounded border-[2px] border-zinc-900 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-[#ffc480]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
