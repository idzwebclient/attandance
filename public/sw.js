// Minimal service worker: makes the app installable and shows an offline notice.
// Nothing is cached for attendance — every punch must reach the server.
const OFFLINE_HTML = `<!doctype html><html lang="ms"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tiada sambungan</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center">
<div><h1 style="color:#0f766e">Hadir</h1><p>Tiada sambungan internet.<br>Kehadiran memerlukan sambungan ke pelayan.</p>
<button onclick="location.reload()" style="padding:12px 20px;border-radius:8px;border:0;background:#0f766e;color:#fff">Cuba lagi</button></div>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
