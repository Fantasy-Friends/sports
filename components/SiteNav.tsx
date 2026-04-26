"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/season/2026", label: "Season" },
  { href: "/calendar", label: "Calendar" },
  { href: "/hot-seat", label: "Hot Seat" },
  { href: "/draft", label: "Draft" },
  { href: "/leaderboard", label: "Player Leaderboard" },
  { href: "/tournament", label: "Tournament Leaderboard" },
  { href: "/preferences", label: "Notifications" },
  { href: "/admin", label: "Admin" },
  { href: "/ux", label: "Design Lab" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const activeItem = NAV_ITEMS.find((item) => item.href === pathname);

  return (
    <nav className="panel-chrome soft-card mb-6 rounded-[1.75rem] border px-4 py-3">
      <div className="flex items-center gap-3 border-b border-border/20 px-1 pb-3 md:mb-3">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-controls="site-nav-mobile-menu"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-surface/60 text-text transition-colors hover:bg-surface md:hidden"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {menuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] uppercase tracking-[0.28em] text-muted sm:text-[11px]">
            2026 Ultimate Sports Decathlon
          </div>
          <div className="truncate text-base font-semibold text-info sm:text-lg">
            {activeItem ? activeItem.label : "Clubhouse Console"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
        </div>
      </div>

      <div className="hidden md:block">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200",
                    active
                      ? "border-accent/20 bg-accent text-white shadow-[0_10px_24px_rgba(99,91,255,0.22)]"
                      : "border-transparent bg-surface/35 text-text hover:bg-surface/60",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {menuOpen && (
        <div id="site-nav-mobile-menu" className="mt-3 grid gap-1 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={[
                  "rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
                  active
                    ? "border-accent/20 bg-accent text-white shadow-[0_10px_24px_rgba(99,91,255,0.22)]"
                    : "border-transparent bg-surface/40 text-text hover:bg-surface/70",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
