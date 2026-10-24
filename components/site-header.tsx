"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { applyTheme, readThemePreference, setDarkClass, THEME_STORAGE_KEY } from "@/lib/theme";

function subscribeTheme(onStoreChange: () => void) {
  const onMedia = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = "skip";
    }
    if (stored) return;
    setDarkClass(readThemePreference());
    onStoreChange();
  };
  window.addEventListener("arena-theme", onStoreChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener("arena-theme", onStoreChange);
    media.removeEventListener("change", onMedia);
  };
}

function themeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

export function SiteHeader() {
  const pathname = usePathname();
  const dark = useSyncExternalStore(subscribeTheme, themeSnapshot, () => false);
  const compare = pathname === "/";
  const board = pathname.startsWith("/leaderboard");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 text-ink">
          <Mark />
          <span className="font-display text-xl tracking-tight">
            LLM <span className="italic text-accent">Arena</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Primary">
          <NavLink href="/" active={compare}>
            Compare
          </NavLink>
          <NavLink href="/leaderboard" active={board}>
            Leaderboard
          </NavLink>
          <button
            type="button"
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => applyTheme(!document.documentElement.classList.contains("dark"))}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 ${active ? "bg-ink text-canvas" : "text-muted"}`}
    >
      {children}
    </Link>
  );
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="7" y="7" width="6" height="18" rx="1.5" fill="var(--bg)" />
      <rect x="19" y="12" width="6" height="13" rx="1.5" fill="var(--accent)" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.5 3.5a8.5 8.5 0 1 0 5 14.5A8.5 8.5 0 0 1 15.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
