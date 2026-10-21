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
  const tiers = await saveAnnualTiers(supabase, fd);
  if (tiers.error) return tiers;
  const carryDays = Number(String(fd.get("carry_forward_max_days") ?? "0") || 0);
  const month = Number(fd.get("carry_forward_month"));
  const day = Number(fd.get("carry_forward_day"));
  if (!Number.isInteger(carryDays) || carryDays < 0 || carryDays > 366) return { error: "Hari bawaan tidak sah." };
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return { error: "Tarikh tamat bawaan tidak sah." };
  const { error: carryError } = await supabase.from("system_settings")
    .update({ carry_forward_max_days: carryDays, carry_forward_month: month, carry_forward_day: day }).eq("id", 1);
  if (carryError) return { error: "Simpan gagal. Cuba lagi." };
  revalidatePath("/", "layout");
  return { ok: "Polisi cuti disimpan." };
}

async function saveAnnualTiers(supabase: Awaited<ReturnType<typeof requireRole>>["supabase"], fd: FormData): Promise<LeaveState> {
  const tiers = new Map<number, number>();
  for (let i = 0; i < 20; i++) {
    const years = String(fd.get(`years_${i}`) ?? "").trim();
    const days = String(fd.get(`tierdays_${i}`) ?? "").trim();
    if (years === "" && days === "") continue;
    const y = Number(years);
    const d = Number(days);
    if (!Number.isInteger(y) || y < 0 || !Number.isInteger(d) || d < 0 || d > 366) {
      return { error: "Tahap cuti tahunan tidak sah." };
    }
    tiers.set(y, d);
  }
  const { error: delError } = await supabase.from("annual_leave_tiers").delete().gte("min_years", 0);
  if (delError) return { error: "Simpan gagal. Cuba lagi." };
  if (tiers.size) {
    const { error } = await supabase.from("annual_leave_tiers")
      .insert([...tiers].map(([min_years, days]) => ({ min_years, days })));
    if (error) return { error: "Simpan gagal. Cuba lagi." };
  }
  return {};
}
