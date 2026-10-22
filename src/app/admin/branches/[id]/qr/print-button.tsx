"use client";

import QRCode from "qrcode";
import { Button } from "@/components/ui";

export function PrintButton() {
  return <Button onClick={() => window.print()}>Cetak</Button>;
}

// Draws the same poster as the page onto a canvas and saves it as a PNG.
export function DownloadButton({ payload, branchName, code }: { payload: string; branchName: string; code: string }) {
  async function download() {
    const W = 1200;
    const H = 1650;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 16;
    ctx.strokeRect(40, 40, W - 80, H - 80);

    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.font = "bold 72px system-ui, sans-serif";
    ctx.fillText("IMBAS UNTUK KEHADIRAN", W / 2, 190);
    ctx.font = "48px system-ui, sans-serif";
    ctx.fillText(branchName, W / 2, 270, W - 160);

    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, payload, { errorCorrectionLevel: "M", margin: 2, width: 960 });
    ctx.drawImage(qr, (W - 960) / 2, 330, 960, 960);

    ctx.font = "34px system-ui, sans-serif";
    ctx.fillText("Buka app Hadir dan tekan butang kehadiran,", W / 2, 1380);
    ctx.fillText("atau imbas dengan kamera telefon.", W / 2, 1430);
    ctx.fillStyle = "#6b7280";
    ctx.font = "28px ui-monospace, monospace";
    ctx.fillText(code, W / 2, 1520);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${branchName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }
  return <Button variant="secondary" onClick={download}>Muat turun (PNG)</Button>;
}
