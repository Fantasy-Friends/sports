"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePushNotifications, type PushStatus } from "@/lib/usePushNotifications";

// One-time "Notifications are now live" launch screen.
//
// Shown once per device after sign-in, unless that device already has push
// turned on. Per-device (localStorage) on purpose: on iPhone, Safari and the
// installed Home Screen app keep separate storage, so someone who reads this
// in Safari, installs, and opens the app sees it once more — this time with
// the "Turn on notifications" button, which is exactly the step they need.

const SEEN_KEY = "notifications-launch-seen-v1";

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // private mode: it'll show again next visit, which is fine
  }
}

const DEMO_NOTIFICATIONS = [
  {
    title: "⏰ TNF kicks off in 30 min",
    body: "You haven't picked DAL @ PHI yet. Picks lock at kickoff.",
    when: "now",
  },
  {
    title: "You're on the clock — The Masters",
    body: "Round 2, pick 11 · pick by 3:15 PM CT",
    when: "2h ago",
  },
  {
    title: "🏈 Week 9 winner: Mike (87 pts)",
    body: "2. Dusty 81 · 3. Tyler 74",
    when: "Mon",
  },
];

const FEATURES = [
  {
    icon: (
      <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    ),
    title: "You're on the clock",
    body: "A ping the moment it's your pick in a draft.",
  },
  {
    icon: (
      <path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    ),
    title: "Pick'em reminders",
    body: "30 minutes before Thursday and weekend kickoffs, only if you have games left to pick.",
  },
  {
    icon: (
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
    ),
    title: "Who won the week",
    body: "Pick'em winners after Monday night, plus final results and Hot Seat calls.",
  },
];

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline h-[1.05em] w-[1.05em] -translate-y-[0.12em]" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function LockScreen() {
  return (
    <div className="nl-phone relative mx-auto w-[15.5rem] sm:w-[19rem]" aria-hidden="true">
      <div className="rounded-[3rem] bg-[#1a1a1a] p-[0.55rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.08)_inset]">
        <div className="nl-wallpaper relative h-[30rem] overflow-hidden rounded-[2.5rem] sm:h-[37rem]">
          <div className="absolute left-1/2 top-2.5 h-[1.6rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-black" />
          <div className="pt-12 text-center text-white sm:pt-14">
            <div className="text-[0.95rem] font-semibold opacity-90">Thursday, November 5</div>
            <div className="text-[3.9rem] font-bold leading-none tracking-[-0.03em] sm:text-[5rem]">6:45</div>
          </div>
          <div className="absolute inset-x-2 bottom-12 space-y-1.5 sm:inset-x-2.5 sm:bottom-20 sm:space-y-2">
            {DEMO_NOTIFICATIONS.map((n, i) => (
              <div
                key={n.title}
                className="nl-notif flex gap-2 rounded-[1.2rem] bg-white/[0.16] p-2.5 text-white backdrop-blur-xl sm:gap-2.5 sm:rounded-[1.35rem] sm:p-3"
                style={{ animationDelay: `${450 + i * 650}ms` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/icon-192.png?v=2" alt="" className="h-8 w-8 shrink-0 rounded-[0.5rem] sm:h-[2.35rem] sm:w-[2.35rem] sm:rounded-[0.6rem]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[0.74rem] font-semibold leading-snug sm:text-[0.82rem]">{n.title}</div>
                    <div className="shrink-0 pt-px text-[0.66rem] opacity-60">{n.when}</div>
                  </div>
                  <div className="text-[0.72rem] leading-snug opacity-90 sm:text-[0.8rem]">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute bottom-2.5 left-1/2 h-[0.3rem] w-[7.5rem] -translate-x-1/2 rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  );
}

function InstallSteps() {
  const steps = [
    <>Tap <ShareGlyph /> <b>Share</b> at the bottom of Safari.</>,
    <>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</>,
    <>Open <b>Pick&rsquo;em</b> from your Home Screen. You&rsquo;ll be asked to turn on notifications there.</>,
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#facc15] text-[0.85rem] font-bold text-[#0a0a0a]">
            {i + 1}
          </span>
          <span className="pt-0.5 text-[0.98rem] leading-relaxed text-[#f2eee3]/90">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function SetupBlock({ status, enabled }: { status: PushStatus; enabled: boolean }) {
  if (enabled) {
    return (
      <p className="text-[1.02rem] leading-relaxed text-[#f2eee3]/90">
        <span className="font-semibold text-[#4ade80]">You&rsquo;re all set.</span> A test notification is on its way. Pick which alerts you get any time in{" "}
        <Link href="/preferences" className="underline underline-offset-4">Notification settings</Link>.
      </p>
    );
  }
  switch (status) {
    case "ios-needs-install":
      return (
        <>
          <p className="mb-4 text-[1.02rem] leading-relaxed text-[#f2eee3]/80">
            On iPhone, notifications come through the Home Screen app. Setup takes about 20 seconds.
          </p>
          <InstallSteps />
        </>
      );
    case "off":
      return (
        <p className="text-[1.02rem] leading-relaxed text-[#f2eee3]/80">
          Turn them on for this device and you&rsquo;re done. You can choose which alerts you get in Notification settings.
        </p>
      );
    case "denied":
      return (
        <p className="text-[1.02rem] leading-relaxed text-[#f2eee3]/80">
          Notifications are blocked for Pick&rsquo;em on this device. To allow them, open your phone&rsquo;s{" "}
          <b>Settings → Notifications → Pick&rsquo;em</b> and turn on <b>Allow Notifications</b>.
        </p>
      );
    default:
      return (
        <p className="text-[1.02rem] leading-relaxed text-[#f2eee3]/80">
          This browser can&rsquo;t receive notifications. Open the site on your phone to set them up.
        </p>
      );
  }
}

/** Mounted by AppShell for every signed-in page; decides for itself whether to show. */
export default function NotificationsLaunch() {
  const { status, busy, error, enable, sendTest } = usePushNotifications();
  const [seen, setSeen] = useState(() => (typeof window === "undefined" ? true : hasSeen()));
  const [enabled, setEnabled] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const open =
    !seen &&
    (enabled || (status !== "loading" && status !== "on" && status !== "not-configured"));

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markSeen();
        setSeen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  function close() {
    markSeen();
    setSeen(true);
  }

  async function turnOn() {
    const ok = await enable();
    if (ok) {
      markSeen();
      setEnabled(true);
      void sendTest();
    }
  }

  const primary =
    enabled
      ? { label: "Continue", onClick: close }
      : status === "off"
        ? { label: busy ? "Turning on…" : "Turn on notifications", onClick: () => void turnOn() }
        : { label: status === "ios-needs-install" ? "Got it" : "Continue", onClick: close };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nl-title"
      ref={dialogRef}
      tabIndex={-1}
      className="nl-root outline-none fixed inset-0 z-[60] overflow-y-auto overscroll-contain text-[#f2eee3]"
    >
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 pb-36 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:px-8 lg:pb-16">
        <div className="flex justify-end">
          {!enabled ? (
            <button
              type="button"
              onClick={close}
              className="rounded-full px-3 py-2 text-[0.92rem] text-[#f2eee3]/70 transition hover:text-[#f2eee3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#facc15]"
            >
              Not now
            </button>
          ) : null}
        </div>

        <div className="grid flex-1 gap-x-16 gap-y-10 lg:grid-cols-[1.05fr,1fr] lg:items-center">
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <span className="nl-ticket inline-flex items-center rounded-md bg-[#facc15] px-2.5 py-1 text-[0.8rem] font-extrabold tracking-[0.04em] text-[#0a0a0a]">
              NEW
            </span>
            <h1
              id="nl-title"
              className="mt-4 text-[2.6rem] font-black leading-[0.95] tracking-[-0.035em] sm:text-[4rem] lg:text-[4.75rem]"
            >
              Notifications are now live
            </h1>
            <p className="mt-5 max-w-[34rem] text-[1.12rem] leading-relaxed text-[#f2eee3]/80 sm:text-[1.2rem]">
              Pick&rsquo;em now taps you on the shoulder when it matters, right on your lock screen.
              No more missed picks or wondering who won the week.
            </p>
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <LockScreen />
          </div>

          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <ul className="space-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true">
                    {f.icon}
                  </svg>
                  <div>
                    <div className="text-[1.05rem] font-semibold">{f.title}</div>
                    <div className="mt-0.5 max-w-[30rem] text-[0.98rem] leading-relaxed text-[#f2eee3]/70">{f.body}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 border-t border-[#f2eee3]/15 pt-8">
              <h2 className="mb-4 text-[1.35rem] font-bold tracking-[-0.01em]">
                {enabled ? "Done" : status === "ios-needs-install" ? "Set it up on your iPhone" : "Set it up"}
              </h2>
              <SetupBlock status={status} enabled={enabled} />
              {error ? <p className="mt-3 text-[0.92rem] text-[#fca5a5]">{error}</p> : null}
            </div>

            {/* Desktop CTA sits inline; mobile gets the sticky bar below. */}
            <div className="mt-8 hidden lg:block">
              <button
                type="button"
                onClick={primary.onClick}
                disabled={busy}
                className="rounded-full bg-[#facc15] px-8 py-3.5 text-[1.02rem] font-bold text-[#0a0a0a] transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#facc15]"
              >
                {primary.label}
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#06140f] via-[#06140f]/95 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-8 lg:hidden">
        <button
          type="button"
          onClick={primary.onClick}
          disabled={busy}
          className="w-full rounded-full bg-[#facc15] py-4 text-[1.05rem] font-bold text-[#0a0a0a] transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#facc15]"
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
