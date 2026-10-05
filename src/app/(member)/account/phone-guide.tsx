"use client";

import { useSyncExternalStore } from "react";
import { Card } from "@/components/ui";

type Os = "ios" | "android" | "other";

const GUIDE: Record<Exclude<Os, "other">, { title: string; install: string[]; permissions: string[] }> = {
  ios: {
    title: "iPhone",
    install: ["Buka app ini dalam Safari.", "Tekan butang Share (petak dengan anak panah).", "Pilih \"Add to Home Screen\", kemudian Add."],
    permissions: [
      "Settings > Apps > Safari > Location: pilih Allow.",
      "Settings > Apps > Safari > Camera: pilih Allow.",
      "iPhone mungkin masih bertanya sekali-sekala. Tekan Allow setiap kali.",
    ],
  },
  android: {
    title: "Android",
    install: ["Buka app ini dalam Chrome.", "Tekan menu ⋮ di atas kanan.", "Pilih \"Add to Home screen\" atau \"Install app\"."],
    permissions: [
      "Bila ditanya lokasi dan kamera, tekan \"Allow\" / \"While using the app\" (bukan \"Only this time\").",
      "Jika tersilap tolak: Chrome > ⋮ > Settings > Site settings > Location / Camera, benarkan laman ini.",
    ],
  },
};

function detect(): Os {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

// Install and permission tips for the staff member's own phone.
export function PhoneGuide() {
  // "other" on the server, the real platform once hydrated.
  const os = useSyncExternalStore(() => () => {}, detect, () => "other" as Os);
  const shown = os === "other" ? (["ios", "android"] as const) : [os];

  return (
    <Card className="space-y-4">
      <h2 className="font-medium">Panduan telefon</h2>
      {shown.map((key) => (
        <div key={key} className="space-y-2 text-sm">
          {shown.length > 1 && <h3 className="font-medium">{GUIDE[key].title}</h3>}
          <p className="text-muted">Pasang di skrin utama:</p>
          <ol className="list-decimal space-y-1 pl-5">{GUIDE[key].install.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="text-muted">Kebenaran lokasi dan kamera:</p>
          <ul className="list-disc space-y-1 pl-5">{GUIDE[key].permissions.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      ))}
    </Card>
  );
}
