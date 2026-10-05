import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { qrPayload } from "@/lib/format";
import type { Branch } from "@/lib/types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Cetak QR" };

export default async function BranchQr({ params }: PageProps<"/admin/branches/[id]/qr">) {
  const { supabase } = await requireRole("admin");
  const { id } = await params;
  const { data: b } = await supabase.from("branches").select("*").eq("id", id).maybeSingle<Branch>();
  if (!b) notFound();

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const svg = await QRCode.toString(qrPayload(origin, b.qr_identifier), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
  });

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="no-print mb-4 flex justify-center"><PrintButton /></div>
      <div className="rounded-2xl border-4 border-black bg-white p-8 text-black">
        <div className="text-3xl font-bold">IMBAS UNTUK KEHADIRAN</div>
        <div className="mt-1 text-xl">{b.name}</div>
        <div className="mx-auto my-6 w-full max-w-sm [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="text-sm">Buka app Hadir dan tekan butang kehadiran, atau imbas dengan kamera telefon.</div>
        <div className="mt-2 font-mono text-xs text-gray-500">{b.qr_identifier.slice(0, 8)}</div>
      </div>
    </div>
  );
}
