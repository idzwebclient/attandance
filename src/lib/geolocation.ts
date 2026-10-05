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
