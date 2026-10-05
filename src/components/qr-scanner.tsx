"use client";

import { useEffect, useRef, useState } from "react";
import { parseQrPayload } from "@/lib/format";
import { Button, Notice } from "./ui";

// Full-screen camera view that resolves with the branch QR identifier.
export function QrScannerView({ onResult, onCancel }: { onResult: (identifier: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const done = useRef(false);
  // Keep the latest callback without restarting the camera on every render.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let cancelled = false;

    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      if (!(await QrScanner.hasCamera())) {
        setError("Kamera tidak ditemui pada peranti ini.");
        return;
      }
      scanner = new QrScanner(
        videoRef.current,
        (result) => {
          if (done.current) return;
          const id = parseQrPayload(result.data);
          if (!id) {
            setHint("Kod QR ini bukan kod kehadiran cawangan.");
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
      } catch (e) {
        const name = e instanceof Error ? e.name : String(e);
        setError(
          /NotAllowed|Permission|denied/i.test(name)
            ? "Kebenaran kamera ditolak. Benarkan akses kamera dalam tetapan pelayar, kemudian cuba lagi."
            : "Kamera tidak dapat dibuka.",
        );
      }
    })();

    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <span className="font-medium">Imbas kod QR cawangan</span>
        <Button variant="secondary" className="!bg-white/10 !text-white !border-white/20" onClick={onCancel}>
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
