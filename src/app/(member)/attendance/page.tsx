import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import type { AttendanceContext } from "@/lib/types";
import { AttendanceClient } from "./attendance-client";

export const metadata: Metadata = { title: "Kehadiran" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const { supabase } = await requireRole("staff", "manager");
  const { qr } = await searchParams;
  const { data, error } = await supabase.rpc("get_attendance_context");
  const context: AttendanceContext = error
    ? { ok: false, code: "SERVER_ERROR", message: "Pelayan tidak dapat dihubungi. Cuba lagi." }
    : data;
  return <AttendanceClient initial={context} scannedQr={typeof qr === "string" ? qr : null} />;
}
