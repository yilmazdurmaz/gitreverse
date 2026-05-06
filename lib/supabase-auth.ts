import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** When true, auth gates are skipped (local dev convenience). */
export const AUTH_SKIP =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_SKIP_AUTH?.trim() === "true";

export function isSupabaseAuthConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}

/**
 * Browser-only Supabase client for Auth (GitHub OAuth).
 * Separate from {@link ./supabase.ts} server cache client.
 */
export function getSupabaseAuthClient(): SupabaseClient | null {
  if (AUTH_SKIP || !isSupabaseAuthConfigured()) return null;
  if (typeof window === "undefined") return null;
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
    browserClient = createClient(url, key, {
      auth: {
        persistSession: true,
        storage: window.localStorage,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}
