"use client";

import { useEffect, useRef, useState } from "react";
import { parseQrPayload } from "@/lib/format";
import { reportPunchIssue } from "@/lib/punch-issues";
import { Button, Notice } from "./ui";

// Cancelling after this long without a result counts as "could not scan".
const STUCK_MS = 8_000;

// Full-screen camera view that resolves with the branch QR identifier.
// Camera problems and failed scans are reported to the admin's punch problem log.
export function QrScannerView({
  onResult,
  onCancel,
  event,
}: {
  onResult: (identifier: string) => void;
  onCancel: () => void;
  event?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const done = useRef(false);
  const openedAt = useRef(0);
  const cameraOn = useRef(false);
  const wrongQr = useRef(false);
  const eventRef = useRef(event);
  // Keep the latest callback without restarting the camera on every render.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let cancelled = false;

    openedAt.current = Date.now();
    const ev = eventRef.current;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      if (!(await QrScanner.hasCamera())) {
        const message = "Kamera tidak ditemui pada peranti ini.";
        setError(message);
        reportPunchIssue("NO_CAMERA", { message, event: ev });
        return;
      }
      scanner = new QrScanner(
        videoRef.current,
        (result) => {
          if (done.current) return;
          const id = parseQrPayload(result.data);
          if (!id) {
            setHint("Kod QR ini bukan kod kehadiran cawangan.");
            if (!wrongQr.current) {
              wrongQr.current = true;
              reportPunchIssue("NOT_BRANCH_QR", { event: ev, detail: result.data.slice(0, 120) });
            }
            return;
          }
          done.current = true;
          scanner?.stop();
          onResultRef.current(id);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
      );
      try {
        await scanner.start();
        cameraOn.current = true;
      } catch (e) {
        const name = e instanceof Error ? e.name : String(e);
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        const denied = /NotAllowed|Permission|denied/i.test(name);
        const message = denied
          ? "Kebenaran kamera ditolak. Benarkan akses kamera dalam tetapan pelayar, kemudian cuba lagi."
          : "Kamera tidak dapat dibuka.";
        setError(message);
        reportPunchIssue(denied ? "CAMERA_DENIED" : "CAMERA_UNAVAILABLE", { message, event: ev, detail });
      }
    })();

    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, []);

  const cancel = () => {
    const secs = Math.round((Date.now() - openedAt.current) / 1000);
    // The camera worked but no branch QR was read: blurry, glare, damaged print, too far...
    if (cameraOn.current && !done.current && secs * 1000 >= STUCK_MS) {
      reportPunchIssue("SCAN_CANCELLED", {
        event,
        detail: `Kamera dibuka ${secs} saat${wrongQr.current ? ", QR lain dikesan" : ""}`,
      });
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <span className="font-medium">Imbas kod QR cawangan</span>
        <Button variant="secondary" className="!bg-white/10 !text-white !border-white/20" onClick={cancel}>
          Batal
        </Button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      </div>
      <div className="space-y-2 p-4">
        {error ? <Notice tone="bad">{error}</Notice> : <p className="text-center text-sm text-white/80">Halakan kamera ke kod QR yang dipaparkan di tempat kerja.</p>}
        {hint && !error && <Notice tone="warn">{hint}</Notice>}
      </div>
    </div>
  );
}
