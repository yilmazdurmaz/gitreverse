"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithGitHub, isLoading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleGitHub() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGitHub();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const loading = authLoading || busy;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/40 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gitreverse-auth-title"
    >
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
        <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fffdf8] p-6 shadow-none">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="gitreverse-auth-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Sign in with GitHub
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border-[2px] border-zinc-900 bg-white text-lg font-bold leading-none text-zinc-900 transition-colors hover:bg-[#ffc480]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Deep Reverse and Manual control need a free GitHub sign-in.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <div className="group relative">
              <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
              <button
                type="button"
                onClick={() => void handleGitHub()}
                disabled={loading}
                className="relative z-10 flex w-full items-center justify-center gap-2 rounded border-[3px] border-zinc-900 bg-[#ffc480] px-4 py-3 text-sm font-semibold text-zinc-900 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    <span>Opening GitHub…</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4 shrink-0"
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
                    Continue with GitHub
                  </>
                )}
              </button>
            </div>
            {error ? (
              <p className="text-center text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <p className="text-center text-xs text-zinc-500">
              Powered by Supabase Auth — your repo URL stays on this page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
