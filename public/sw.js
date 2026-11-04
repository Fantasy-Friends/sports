// Service worker for Fantasy Friends.
//
// Job #1: receive web push messages and show them as notifications.
// Job #2: when a notification is tapped, focus the app (or open it) at the
//         URL the server attached to the message.
//
// Deliberately NO offline caching — the app is live data all the way down and
// stale cached pages would be worse than a network error.
//
// Payload shape (see lib/notifications/webPush.ts):
//   { title, body, url, tag?, badgeCount? }

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Fantasy Friends";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    // Re-alert when a notification with the same tag replaces an older one
    // (e.g. a second "you're on the clock" for the next pick).
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };

  const work = [self.registration.showNotification(title, options)];
  if (typeof data.badgeCount === "number" && "setAppBadge" in self.navigator) {
    work.push(
      data.badgeCount > 0
        ? self.navigator.setAppBadge(data.badgeCount)
        : self.navigator.clearAppBadge(),
    );
  }
  // iOS requires every push to show a visible notification; waitUntil keeps
  // the worker alive until it has.
  event.waitUntil(Promise.all(work).catch(() => undefined));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
