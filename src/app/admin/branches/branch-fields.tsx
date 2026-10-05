"use client";

import { useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { getCurrentPosition, LocationError } from "@/lib/geolocation";
import type { Branch } from "@/lib/types";

export function BranchFields({ branch, defaultRadius }: { branch?: Branch; defaultRadius: number }) {
  const [lat, setLat] = useState(branch ? String(branch.latitude) : "");
  const [lng, setLng] = useState(branch ? String(branch.longitude) : "");
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [locating, setLocating] = useState(false);

  async function useHere() {
    setLocating(true);
    setNote(null);
    try {
      const pos = await getCurrentPosition();
      setLat(pos.latitude.toFixed(6));
      setLng(pos.longitude.toFixed(6));
      setNote({ tone: "good", text: `Lokasi diambil (ketepatan ±${Math.round(pos.accuracy)} m).` });
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof LocationError ? e.message : "Lokasi tidak dapat diperoleh." });
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Nama cawangan">
        <input name="name" defaultValue={branch?.name} required className={inputClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Latitud">
          <input name="latitude" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label="Longitud">
          <input name="longitude" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label="Radius dibenarkan (meter)">
          <input name="allowed_radius_meters" type="number" min={10} max={5000}
            defaultValue={branch?.allowed_radius_meters ?? defaultRadius} required className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={useHere} disabled={locating}>
          {locating ? "Mendapatkan lokasi…" : "Guna lokasi saya sekarang"}
        </Button>
        {lat && lng && (
          <a className="text-sm text-brand hover:underline" target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`}>
            Semak di Google Maps
          </a>
        )}
      </div>
      <p className="text-xs text-muted">
        Tip: berdiri di cawangan dan tekan &quot;Guna lokasi saya sekarang&quot;, atau salin koordinat dari Google Maps (klik kanan pada peta).
      </p>
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
    </div>
  );
}
