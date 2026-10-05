export type Position = { latitude: number; longitude: number; accuracy: number };

export class LocationError extends Error {
  constructor(
    public code: "LOCATION_DENIED" | "LOCATION_UNAVAILABLE" | "LOCATION_TIMEOUT" | "LOCATION_UNSUPPORTED",
    message: string,
  ) {
    super(message);
  }
}

// One-shot, high-accuracy reading. No background tracking.
export function getCurrentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationError("LOCATION_UNSUPPORTED", "Peranti ini tidak menyokong lokasi."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new LocationError("LOCATION_DENIED",
            "Kebenaran lokasi ditolak. Benarkan akses lokasi untuk laman ini dalam tetapan pelayar, kemudian cuba lagi."));
        } else if (err.code === err.TIMEOUT) {
          reject(new LocationError("LOCATION_TIMEOUT", "Lokasi mengambil masa terlalu lama. Cuba lagi."));
        } else {
          reject(new LocationError("LOCATION_UNAVAILABLE", "Lokasi peranti tidak dapat diperoleh. Hidupkan GPS dan cuba lagi."));
        }
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

// A reading is reused for this long, so a punch right after the page warmed
// up the GPS does not wait for a new fix.
const FRESH_MS = 10_000;
let cached: { position: Position; at: number } | null = null;
let inflight: Promise<Position> | null = null;

export function getFreshPosition(): Promise<Position> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.position);
  inflight ??= getCurrentPosition()
    .then((position) => {
      cached = { position, at: Date.now() };
      return position;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// Start a GPS fix in the background, but only when permission was already
// granted, so opening the page never triggers a prompt by itself.
// Forget the cached reading, e.g. after a punch, so the next one is measured anew.
export function clearPosition() {
  cached = null;
}

export async function warmUpPosition() {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    if (status?.state === "granted") getFreshPosition().catch(() => {});
  } catch {
    // Permissions API unsupported (older Safari): wait for the tap instead.
  }
}
