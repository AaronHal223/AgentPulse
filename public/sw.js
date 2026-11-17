// AgentPulse service worker: makes the app installable, loads fast, shows a friendly page
// offline, and displays notifications (price drops, status changes, strong new matches).
const VERSION = "agentpulse-v2";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls or private data.
  if (url.pathname.startsWith("/api/")) return;

  // Build assets are fingerprinted, so cache-first is safe.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: always go to the network (data is live); fall back to the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener("push", (event) => {
  let note = {};
  try {
    note = event.data ? event.data.json() : {};
  } catch {
    note = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(note.title || "AgentPulse", {
      body: note.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: note.tag,
      data: { url: note.url || "/alerts" },
    }),
  );
});

// Tapping a notification opens the app on the page it's about (always a page of this site).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL((event.notification.data && event.notification.data.url) || "/alerts", self.location.origin);
  if (target.origin !== self.location.origin) target = new URL("/alerts", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(target.href);
      const moved = await open.navigate(target.href).catch(() => null);
      return moved ? moved.focus() : self.clients.openWindow(target.href);
    }),
  );
});
