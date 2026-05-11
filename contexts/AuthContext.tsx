"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  AUTH_SKIP,
  getSupabaseAuthClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase-auth";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /** True when signed in, or when auth is skipped / misconfigured per policy. */
  isAuthenticated: boolean;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_DISABLED = AUTH_SKIP || !isSupabaseAuthConfigured();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(!AUTH_DISABLED);

  useEffect(() => {
    if (AUTH_DISABLED) {
      return;
    }

    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      void Promise.resolve().then(() => setIsLoading(false));
      return;
    }

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGitHub = useCallback(async () => {
    if (AUTH_DISABLED) return;

    const supabase = getSupabaseAuthClient();
    if (!supabase) {
      throw new Error("GitReverse auth is not configured.");
    }

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: "read:user user:email",
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL returned.");

    const popup = window.open(
      data.url,
      "github-oauth",
      "width=520,height=720,scrollbars=yes,resizable=yes"
    );

    if (!popup) {
      window.location.href = data.url;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (AUTH_DISABLED) return;
    const supabase = getSupabaseAuthClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const isAuthenticated = AUTH_DISABLED || Boolean(user);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated,
      signInWithGitHub,
      signOut,
    }),
    [user, session, isLoading, isAuthenticated, signInWithGitHub, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
