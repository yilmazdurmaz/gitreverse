"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_SKIP, isSupabaseAuthConfigured } from "@/lib/supabase-auth";
import type { User } from "@supabase/supabase-js";

function IconBooks({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="12" y1="6" x2="16" y2="6" />
      <line x1="12" y1="10" x2="16" y2="10" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconPremiumBadge({ size = 17 }: { size?: number }) {
  const raw = useId();
  const filterId = `nav-premium-${raw.replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feOffset dx="0" dy="0.8" />
          <feGaussianBlur stdDeviation="1.2" result="offset-blur" />
          <feComposite
            operator="out"
            in="SourceGraphic"
            in2="offset-blur"
            result="inverse"
          />
          <feFlood floodColor="#a01209" floodOpacity="0.5" result="color" />
          <feComposite operator="in" in="color" in2="inverse" result="shadow" />
          <feComposite operator="over" in="shadow" in2="SourceGraphic" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path fill="none" d="M0 0h24v24H0z" />
        <path
          fill="#d31611"
          stroke="#a01209"
          strokeWidth="0.5"
          d="m23 12-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"
        />
      </g>
    </svg>
  );
}

function IconLogOut({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const SUBSCRIBER_EMAIL_KEY = "gr_subscriber_email";

function userDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    "";
  if (full.trim()) return full.trim();
  const email = user.email?.trim();
  return email ?? "Account";
}

function userInitials(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase() || "?"
    );
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length === 1) {
    return parts[0]!.toUpperCase();
  }
  const email = user.email?.split("@")[0]?.trim();
  if (email && email.length >= 2) return email.slice(0, 2).toUpperCase();
  if (email && email.length === 1) return email.toUpperCase();
  return "?";
}

export type NavbarProps = {
  isSubscriber?: boolean;
};

function NavDivider() {
  return (
    <div className="mx-1 h-6 w-px shrink-0 bg-zinc-200" aria-hidden />
  );
}

function IconLinkWithTooltip({
  href,
  label,
  children,
  isActive,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  const [showTip, setShowTip] = useState(false);
  const [hov, setHov] = useState(false);
  const shadowShift = hov ? "translate(2px,2px)" : "translate(3px,3px)";
  const btnShift = hov ? "-translate-x-px -translate-y-px" : "";

  return (
    <div
      className="group relative inline-flex"
      onMouseEnter={() => {
        setHov(true);
        setShowTip(true);
      }}
      onMouseLeave={() => {
        setHov(false);
        setShowTip(false);
      }}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-md bg-zinc-900 transition-transform duration-100"
        style={{ transform: shadowShift }}
        aria-hidden
      />
      <Link
        href={href}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex h-9 w-9 items-center justify-center rounded-md border-[2.5px] border-zinc-900 bg-[#fff4da] text-zinc-900 transition-transform duration-100 ${btnShift} ${isActive ? "ring-2 ring-zinc-400" : ""}`}
      >
        {children}
      </Link>
      {showTip ? (
        <div
          className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white"
          role="tooltip"
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

function PremiumButton({ isSubscriber }: { isSubscriber: boolean }) {
  const [hov, setHov] = useState(false);
  const shadowShift = hov ? "translate(2px,2px)" : "translate(3px,3px)";
  const btnShift = hov ? "-translate-x-px -translate-y-px" : "";

  if (isSubscriber) {
    return (
      <span className="relative isolate inline-flex">
        <span
          className="pointer-events-none absolute inset-0 rounded-md bg-zinc-900"
          style={{ transform: shadowShift }}
          aria-hidden
        />
        <span
          className={`relative inline-flex items-center gap-1.5 rounded-md border-[2.5px] border-zinc-900 bg-[#fff4da] px-3.5 py-1.5 text-sm font-bold text-zinc-900`}
        >
          <IconPremiumBadge size={17} />
          Premium
        </span>
      </span>
    );
  }

  return (
    <span className="relative isolate inline-flex">
      <span
        className="pointer-events-none absolute inset-0 rounded-md bg-zinc-900 transition-transform duration-100"
        style={{ transform: shadowShift }}
        aria-hidden
      />
      <Link
        href="/premium"
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-md border-[2.5px] border-zinc-900 bg-[#fff4da] px-3.5 py-1.5 text-sm font-bold text-zinc-900 transition-transform duration-100 ${btnShift}`}
      >
        <IconPremiumBadge size={17} />
        Premium
      </Link>
    </span>
  );
}

export function Navbar({ isSubscriber: isSubscriberProp }: NavbarProps) {
  const pathname = usePathname();
  const { user, isLoading: authLoading, signInWithGitHub, signOut } = useAuth();
  const authUiEnabled =
    Boolean(!AUTH_SKIP && isSupabaseAuthConfigured());

  const [subscriberFromStorage, setSubscriberFromStorage] = useState(false);
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

  const isSubscriber = Boolean(isSubscriberProp) || subscriberFromStorage;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [menuOpen]);

  const busySignInRef = useRef(false);
  const handleSignIn = useCallback(async () => {
    if (busySignInRef.current) return;
    busySignInRef.current = true;
    try {
      await signInWithGitHub();
    } catch {
      /* AuthModal elsewhere may surface errors */
    } finally {
      busySignInRef.current = false;
    }
  }, [signInWithGitHub]);

  const menuId = useId();

  return (
    <nav className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#FFFDF8]">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-xl font-bold tracking-tight transition-transform hover:-translate-y-0.5"
          aria-label="GitReverse home"
        >
          <span className="text-zinc-900">Git</span>
          <span className="text-[#d31611]">Reverse</span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-2">
          <IconLinkWithTooltip
            href="/library"
            label="Library"
            isActive={pathname === "/library"}
          >
            <IconBooks />
          </IconLinkWithTooltip>
          <IconLinkWithTooltip
            href="/history"
            label="History"
            isActive={pathname === "/history"}
          >
            <IconClock />
          </IconLinkWithTooltip>

          <NavDivider />

          <div className="shrink-0">
            <PremiumButton isSubscriber={isSubscriber} />
          </div>

          <NavDivider />

          {authUiEnabled ? (
            user ? (
              <div className="relative shrink-0" ref={menuRef}>
                <span className="relative isolate inline-flex">
                  <span
                    className="pointer-events-none absolute inset-0 rounded-[6px] bg-zinc-900"
                    style={{ transform: "translate(3px,3px)" }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="relative flex h-9 w-9 items-center justify-center rounded-[6px] border-[2.5px] border-zinc-900 bg-[#d31611] text-xs font-extrabold tracking-tight text-white"
                    aria-expanded={menuOpen}
                    aria-haspopup="true"
                    aria-controls={menuOpen ? menuId : undefined}
                    onClick={() => setMenuOpen((o) => !o)}
                  >
                    {userInitials(user)}
                  </button>
                </span>

                {menuOpen ? (
                  <div
                    id={menuId}
                    className="absolute right-0 top-[calc(100%+12px)] z-[200] min-w-[200px] overflow-hidden rounded-[10px] border-[3px] border-zinc-900 bg-[#FFFDF8]"
                    role="menu"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 rounded-[10px] bg-zinc-900"
                      style={{ transform: "translate(5px,5px)" }}
                      aria-hidden
                    />
                    <div className="relative rounded-[10px] bg-[#FFFDF8]">
                      <div className="border-b-2 border-zinc-200 bg-[#fff4da] px-4 py-3.5">
                        <p className="text-sm font-extrabold tracking-tight text-zinc-900">
                          {userDisplayName(user)}
                        </p>
                        {user.email ? (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {user.email}
                          </p>
                        ) : null}
                        {isSubscriber ? (
                          <span className="mt-2 inline-flex items-center gap-1 rounded border-[1.5px] border-zinc-900 bg-[#fff4da] px-2 py-0.5 text-[11px] font-bold text-zinc-900">
                            <IconPremiumBadge size={12} />
                            Premium
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => {
                          setMenuOpen(false);
                          void signOut();
                        }}
                      >
                        <IconLogOut />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : !authLoading ? (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="shrink-0 rounded-md border-[2.5px] border-zinc-900 bg-white px-3 py-1.5 text-sm font-bold text-zinc-900 hover:bg-zinc-50"
              >
                Sign in
              </button>
            ) : (
              <div
                className="h-9 w-9 shrink-0 rounded-[6px] border-[2.5px] border-zinc-200 bg-zinc-100 animate-pulse"
                aria-hidden
              />
            )
          ) : null}
        </div>
      </div>
    </nav>
  );
}
