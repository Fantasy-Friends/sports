"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePushNotifications, type PushStatus } from "@/lib/usePushNotifications";

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline h-4 w-4 -translate-y-0.5"
      aria-label="Share"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function IosInstallSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-text">
      <li>
        Tap the <ShareIcon /> <span className="font-medium">Share</span> button in Safari&rsquo;s
        toolbar.
      </li>
      <li>
        Scroll down and tap <span className="font-medium">Add to Home Screen</span>, then{" "}
        <span className="font-medium">Add</span>.
      </li>
      <li>
        Open <span className="font-medium">Fantasy Friends</span> from your Home Screen and come
        back to this page to turn on notifications.
      </li>
    </ol>
  );
}

const STATUS_LINE: Record<PushStatus, string> = {
  loading: "Checking this device…",
  "ios-needs-install": "On iPhone, notifications need the app on your Home Screen first.",
  unsupported: "This browser doesn't support push notifications.",
  "not-configured": "Push isn't set up on the server yet (missing VAPID keys).",
  denied:
    "Notifications are blocked for this app. Turn them back on in Settings → Notifications → Fantasy Friends.",
  off: "Get a lock-screen alert when you're on the clock, an event goes final, and more.",
  on: "This device will get notifications.",
};

/** Full card for the Notifications (preferences) page. */
export function PushSettingsCard() {
  const { status, busy, error, enable, disable, sendTest } = usePushNotifications();
  const [testSent, setTestSent] = useState(false);

  return (
    <div className="soft-card space-y-3 rounded-[1.5rem] border border-border/20 bg-surface/35 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted">This device</div>
          <div className="mt-0.5 text-base font-semibold">Push notifications</div>
        </div>
        {status === "on" ? (
          <span className="rounded-md bg-[#4ade80]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#16a34a]">
            On
          </span>
        ) : null}
      </div>

      <p className="text-sm text-muted">{STATUS_LINE[status]}</p>

      {status === "ios-needs-install" ? <IosInstallSteps /> : null}

      {error ? (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status === "off" ? (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        ) : null}
        {status === "on" ? (
          <>
            <button
              type="button"
              onClick={async () => {
                setTestSent(false);
                setTestSent(await sendTest());
              }}
              disabled={busy}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send a test
            </button>
            <button
              type="button"
              onClick={() => void disable()}
              disabled={busy}
              className="rounded-xl border border-border/40 px-4 py-2 text-sm text-muted disabled:opacity-50"
            >
              Turn off on this device
            </button>
            {testSent ? <span className="text-xs text-info">Sent — check your lock screen.</span> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

const DISMISS_KEY = "push-prompt-dismissed-at";
const DISMISS_DAYS = 14;

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Compact banner shown at the top of every AppShell page until the device
 * has notifications on (or the banner is dismissed for 14 days).
 */
export function PushPrompt() {
  const pathname = usePathname();
  const { status, busy, error, enable } = usePushNotifications();
  // Only ever rendered client-side (AppShell mounts it after the session
  // check), so reading localStorage in the initializer is hydration-safe.
  const [dismissed, setDismissed] = useState(() =>
    typeof window === "undefined" ? true : wasDismissedRecently(),
  );
  const [showSteps, setShowSteps] = useState(false);

  if (dismissed || pathname === "/preferences") return null;
  if (status !== "off" && status !== "ios-needs-install") return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode — dismiss for this page view only
    }
    setDismissed(true);
  }

  return (
    <div className="mb-4 rounded-[1.25rem] border border-[#4ade80]/30 bg-[#0b2a22] p-3 text-[#e9e3d1] sm:p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {status === "ios-needs-install"
              ? "Get Fantasy Friends on your Home Screen"
              : "Know the second you're on the clock"}
          </div>
          <div className="mt-0.5 text-xs text-[#e9e3d1]/75">
            {status === "ios-needs-install"
              ? "Install it like an app to get lock-screen notifications. Takes 10 seconds."
              : "Turn on notifications for draft turns, final results, and Hot Seat calls."}
          </div>
          {error ? <div className="mt-1 text-xs text-[#fca5a5]">{error}</div> : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded-md p-1 text-[#e9e3d1]/60 hover:text-[#e9e3d1]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {status === "ios-needs-install" && showSteps ? (
        <div className="mt-3 rounded-xl bg-white/5 p-3 [&_*]:!text-[#e9e3d1]">
          <IosInstallSteps />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "off" ? (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="rounded-lg bg-[#4ade80] px-3 py-1.5 text-xs font-bold text-[#08201a] disabled:opacity-50"
          >
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowSteps((s) => !s)}
            className="rounded-lg bg-[#4ade80] px-3 py-1.5 text-xs font-bold text-[#08201a]"
          >
            {showSteps ? "Hide steps" : "Show me how"}
          </button>
        )}
        <Link href="/preferences" className="text-xs text-[#e9e3d1]/70 underline underline-offset-2">
          Notification settings
        </Link>
      </div>
    </div>
  );
}
