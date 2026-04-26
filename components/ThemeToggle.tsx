"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const currentTheme: Theme =
    mounted && document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : theme;
  const nextTheme: Theme = currentTheme === "light" ? "dark" : "light";

  function toggleTheme() {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  const ariaLabel = mounted
    ? `Switch to ${nextTheme} mode`
    : "Toggle light and dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-bg/80 px-3 text-xs font-semibold text-text transition-all hover:border-accent/70 hover:text-accent"
    >
      <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center">
        {mounted && currentTheme === "dark" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </span>
      <span className="hidden sm:inline">
        {mounted ? (currentTheme === "dark" ? "Light" : "Dark") : "Theme"}
      </span>
    </button>
  );
}
