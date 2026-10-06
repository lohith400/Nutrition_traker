// Minimal service worker: makes the app installable ("Add to Home Screen").
// It deliberately caches nothing, so you always see your latest data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "NutriSync";
  const body = data.body || "Time for your scheduled reminder.";
  const url = data.url || "/reminders";
  const tag = data.tag || "nutrisync-reminder";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/reminders";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          const clientOrigin = new URL(client.url).origin;
          const selfOrigin = self.location.origin;
          if (clientOrigin === selfOrigin) {
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // Browser refreshed the subscription; attempt re-subscribing and updating server
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then((sub) => {
        return fetch("/api/reminders/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      })
      .catch((err) => {
        // Logging only; subscription change errors cannot be surfaced directly to user
        console.warn("Failed to refresh push subscription:", err);
      })
  );
});
