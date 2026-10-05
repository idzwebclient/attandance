"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "./auth";

export type FieldWorkState = { error?: string; ok?: string };

export async function grantFieldWork(_prev: FieldWorkState, fd: FormData): Promise<FieldWorkState> {
  const { supabase } = await requireRole("admin", "manager");
  const employee = String(fd.get("employee_id") ?? "");
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "") || from;
  if (!employee) return { error: "Pilih pekerja." };
  if (!from) return { error: "Pilih tarikh." };
  const { data, error } = await supabase.rpc("grant_field_work", {
    p_employee_id: employee,
    p_from: from,
    p_to: to,
    p_note: String(fd.get("note") ?? ""),
  });
  if (error) return { error: "Tidak dapat disimpan. Cuba lagi." };
  if (!data.ok) return { error: data.message };
  revalidatePath("/", "layout");
  return { ok: `Kerja luar ditetapkan untuk ${data.days} hari.` };
}

export async function revokeFieldWork(fd: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  await supabase.rpc("revoke_field_work", { p_permit_id: String(fd.get("id") ?? "") });
  revalidatePath("/", "layout");
}
