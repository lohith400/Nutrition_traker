// Minimal service worker: makes the app installable ("Add to Home Screen").
// It deliberately caches nothing, so you always see your latest data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
