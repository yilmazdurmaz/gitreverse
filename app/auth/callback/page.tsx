"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  AUTH_SKIP,
  getSupabaseAuthClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase-auth";

function AuthCallbackInner() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    async function run() {
      if (AUTH_SKIP || !isSupabaseAuthConfigured()) {
        setMessage("Auth is disabled in this environment.");
        return;
      }

      const supabase = getSupabaseAuthClient();
      if (!supabase) {
        setMessage("Auth client unavailable.");
        return;
      }

      const errorParam = searchParams.get("error");
      const errorDesc = searchParams.get("error_description");
      if (errorParam) {
        setMessage(errorDesc?.trim() || "Sign in was cancelled.");
        return;
      }

      const code = searchParams.get("code");
      if (!code) {
        setMessage("Missing authorization code.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Success — you can close this window.");
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, 300);
    }

    void run();
  }, [searchParams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#fffdf8] px-4">
      <p className="text-center text-sm font-medium text-zinc-800">
        {message}
      </p>
      <p className="mt-3 max-w-sm text-center text-xs text-zinc-500">
        If this tab doesn&apos;t close automatically, return to GitReverse —
        you&apos;re signed in.
      </p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#fffdf8]">
          <p className="text-sm text-zinc-600">Loading…</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
