"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "./auth";
import { LEAVE_TYPE_LABEL } from "./format";
import type { LeaveType } from "./types";

export type LeaveState = { error?: string; ok?: string };

export async function applyLeave(_prev: LeaveState, fd: FormData): Promise<LeaveState> {
  const { supabase } = await requireRole("staff", "manager");
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "") || from;
  if (!from) return { error: "Pilih tarikh." };
  const { data, error } = await supabase.rpc("apply_leave", {
    p_type: String(fd.get("leave_type") ?? ""),
    p_from: from,
    p_to: to,
    p_reason: String(fd.get("reason") ?? ""),
  });
  if (error) return { error: "Permohonan tidak dapat dihantar. Cuba lagi." };
  if (!data.ok) return { error: data.message };
  revalidatePath("/", "layout");
  return { ok: "Permohonan cuti dihantar. Tunggu kelulusan." };
}

export async function cancelLeave(fd: FormData) {
  const { supabase } = await requireRole("staff", "manager");
  await supabase.rpc("cancel_leave", { p_id: String(fd.get("id") ?? "") });
  revalidatePath("/", "layout");
}

export async function decideLeave(fd: FormData) {
  const { supabase } = await requireRole("admin", "manager");
  await supabase.rpc("decide_leave", {
    p_id: String(fd.get("id") ?? ""),
    p_approve: fd.get("approve") === "true",
    p_note: String(fd.get("note") ?? ""),
  });
  revalidatePath("/", "layout");
}

export async function updateLeavePolicies(_prev: LeaveState, fd: FormData): Promise<LeaveState> {
  const { supabase } = await requireRole("admin");
  for (const type of Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]) {
    const raw = String(fd.get(`days_${type}`) ?? "").trim();
    const days = raw === "" ? null : Number(raw);
    if (days != null && (!Number.isInteger(days) || days < 0 || days > 366)) {
      return { error: `Had hari untuk ${LEAVE_TYPE_LABEL[type]} tidak sah.` };
    }
    const { error } = await supabase.from("leave_policies")
      .update({ annual_days: days, is_active: fd.get(`active_${type}`) === "on", updated_at: new Date().toISOString() })
      .eq("leave_type", type);
    if (error) return { error: "Simpan gagal. Cuba lagi." };
  }
  revalidatePath("/", "layout");
  return { ok: "Polisi cuti disimpan." };
}
