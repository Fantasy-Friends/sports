"use client";

import { useCallback, useEffect, useState } from "react";

// Client-side state machine for web push on this device.
//
//   ios-needs-install — iPhone/iPad in Safari; push only exists once the site
//                       is added to the Home Screen and opened from there
//   unsupported       — browser has no service worker / Push API
//   not-configured    — server VAPID key missing (env not set yet)
//   denied            — user blocked notifications in system settings
//   off               — supported, not subscribed yet
//   on                — subscribed and saved on the server
export type PushStatus =
  | "loading"
  | "ios-needs-install"
  | "unsupported"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Couldn't save subscription (${res.status})`);
  }
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setStatus(isIos() && !isStandalone() ? "ios-needs-install" : "unsupported");
      return;
    }
    if (isIos() && !isStandalone()) {
      setStatus("ios-needs-install");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setStatus("not-configured");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Re-save on every load: cheap, and heals a row the server deleted
        // or a subscription the browser silently rotated.
        await saveSubscription(sub).catch(() => undefined);
        setStatus("on");
      } else {
        setStatus("off");
      }
    } catch {
      setStatus("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Must be called from a tap/click — iOS only shows the permission prompt
  // in response to a user gesture.
  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return false;
      }
      const reg = await getRegistration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      await saveSubscription(sub);
      setStatus("on");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn on notifications");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn off notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error ?? "Test push failed");
      if (body.skipped === "no_subscriptions") throw new Error("No devices registered yet.");
      if (body.skipped === "not_configured") throw new Error("Push isn't configured on the server.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test push failed");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, enable, disable, sendTest, refresh };
}
