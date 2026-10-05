// Minimal service worker so the app can be installed. It deliberately has no
// fetch handler: routing navigations through a worker only adds latency, and
// attendance must always reach the server anyway.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
