"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { tzOffset } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optional = (fd: FormData, k: string) => str(fd, k) || null;

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Maklumat tidak sah.";
}

// ---------------------------------------------------------------- employees

const role = z.enum(["staff", "manager", "admin"], { message: "Peranan tidak sah." });
const profileFields = z.object({
  full_name: z.string().min(1, "Nama diperlukan."),
  employee_code: z.string().min(1, "No. pekerja diperlukan."),
  role,
  branch_id: z.uuid("Cawangan tidak sah.").nullable(),
});

function readProfile(fd: FormData) {
  return profileFields.safeParse({
    full_name: str(fd, "full_name"),
    employee_code: str(fd, "employee_code"),
    role: str(fd, "role"),
    branch_id: optional(fd, "branch_id"),
  });
}

function profileError(message: string) {
  return /employee_code/.test(message) ? "No. pekerja sudah digunakan." : "Simpan gagal. Cuba lagi.";
}

export async function createEmployee(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = readProfile(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const p = parsed.data;
  if (p.role !== "admin" && !p.branch_id) return { error: "Staf dan manager mesti ditetapkan ke cawangan." };
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!z.email().safeParse(email).success) return { error: "Emel tidak sah." };
  if (password.length < 8) return { error: "Kata laluan sementara mesti sekurang-kurangnya 8 aksara." };

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) {
    return { error: /already/i.test(error?.message ?? "") ? "Emel sudah didaftarkan." : "Akaun tidak dapat dicipta." };
  }
  const { error: insertError } = await admin.from("profiles").insert({ auth_user_id: created.user.id, ...p });
  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError(insertError.message) };
  }
  revalidatePath("/admin", "layout");
  return { ok: `Akaun ${p.full_name} dicipta. Berikan emel dan kata laluan sementara kepada pekerja.` };
}

export async function updateEmployee(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, profile: me } = await requireRole("admin");
  const id = str(fd, "id");
  const parsed = readProfile(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const p = parsed.data;
  if (p.role !== "admin" && !p.branch_id) return { error: "Staf dan manager mesti ditetapkan ke cawangan." };
  if (id === me.id && p.role !== "admin") return { error: "Anda tidak boleh membuang peranan admin anda sendiri." };
  const email = str(fd, "email").toLowerCase();
  if (email && !z.email().safeParse(email).success) return { error: "Emel tidak sah." };

  const { data: current, error } = await supabase.from("profiles").update(p).eq("id", id).select("auth_user_id").single();
  if (error || !current) return { error: profileError(error?.message ?? "") };

  if (email) {
    const admin = createAdminClient();
    const { data: user } = await admin.auth.admin.getUserById(current.auth_user_id);
    if (user.user && user.user.email?.toLowerCase() !== email) {
      // Admin-confirmed change: takes effect immediately, no confirmation email.
      const { error: emailError } = await admin.auth.admin.updateUserById(current.auth_user_id, { email, email_confirm: true });
      if (emailError) {
        return { error: /already|registered|exists/i.test(emailError.message) ? "Emel sudah digunakan oleh akaun lain." : "Emel tidak dapat ditukar." };
      }
      revalidatePath("/admin", "layout");
      return { ok: `Disimpan. Emel log masuk kini ${email}.` };
    }
  }
  revalidatePath("/admin", "layout");
  return { ok: "Disimpan." };
}

export async function setEmployeeActive(fd: FormData) {
  const { supabase, profile: me } = await requireRole("admin");
  const id = str(fd, "id");
  const active = str(fd, "active") === "true";
  if (id === me.id && !active) return;
  const { data: target } = await supabase.from("profiles").update({ is_active: active }).eq("id", id)
    .select("auth_user_id").single();
  if (target) {
    // Also block sign-in at the auth level while inactive.
    await createAdminClient().auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: active ? "none" : "876000h",
    });
  }
  revalidatePath("/admin", "layout");
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const password = str(fd, "password");
  if (password.length < 8) return { error: "Kata laluan mesti sekurang-kurangnya 8 aksara." };
  const { data: target } = await supabase.from("profiles").select("auth_user_id").eq("id", str(fd, "id")).single();
  if (!target) return { error: "Pekerja tidak dijumpai." };
  const { error } = await createAdminClient().auth.admin.updateUserById(target.auth_user_id, { password });
  if (error) return { error: "Kata laluan tidak dapat ditukar." };
  return { ok: "Kata laluan sementara ditetapkan." };
}

// ----------------------------------------------------------------- branches

const branchFields = z.object({
  name: z.string().min(1, "Nama cawangan diperlukan."),
  latitude: z.coerce.number().min(-90, "Latitud tidak sah.").max(90, "Latitud tidak sah."),
  longitude: z.coerce.number().min(-180, "Longitud tidak sah.").max(180, "Longitud tidak sah."),
  allowed_radius_meters: z.coerce.number().int("Radius mesti nombor bulat.").min(10, "Radius minimum 10 m.").max(5000, "Radius maksimum 5000 m."),
});

function readBranch(fd: FormData) {
  return branchFields.safeParse({
    name: str(fd, "name"),
    latitude: str(fd, "latitude"),
    longitude: str(fd, "longitude"),
    allowed_radius_meters: str(fd, "allowed_radius_meters"),
  });
}

export async function createBranch(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const parsed = readBranch(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { data, error } = await supabase.from("branches").insert(parsed.data).select("id").single();
  if (error) return { error: "Cawangan tidak dapat dicipta." };
  revalidatePath("/admin", "layout");
  redirect(`/admin/branches/${data.id}`);
}

export async function updateBranch(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const parsed = readBranch(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await supabase.from("branches").update(parsed.data).eq("id", str(fd, "id"));
  if (error) return { error: "Simpan gagal." };
  revalidatePath("/admin", "layout");
  return { ok: "Disimpan." };
}

export async function setBranchActive(fd: FormData) {
  const { supabase } = await requireRole("admin");
  await supabase.from("branches").update({ is_active: str(fd, "active") === "true" }).eq("id", str(fd, "id"));
  revalidatePath("/admin", "layout");
}

export async function regenerateQr(fd: FormData) {
  const { supabase } = await requireRole("admin");
  await supabase
    .from("branches")
    .update({ qr_identifier: crypto.randomUUID().replaceAll("-", "") })
    .eq("id", str(fd, "id"));
  revalidatePath("/admin", "layout");
}

// ----------------------------------------------------------------- settings

const settingsFields = z.object({
  work_start_time: z.string().regex(/^\d{2}:\d{2}$/, "Masa mula tidak sah."),
  work_end_time: z.string().regex(/^\d{2}:\d{2}$/, "Masa tamat tidak sah."),
  break_max_minutes: z.coerce.number().int().min(1, "Had rehat tidak sah.").max(600),
  default_radius_meters: z.coerce.number().int().min(10).max(5000),
  max_location_accuracy_meters: z.coerce.number().int().min(5).max(5000),
  timezone: z.string().min(1),
  work_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pilih sekurang-kurangnya satu hari bekerja."),
  cycle_start_day: z.coerce.number().int().min(1, "Hari mula kitaran 1–28.").max(28, "Hari mula kitaran 1–28."),
});

export async function updateSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const parsed = settingsFields.safeParse({
    work_start_time: str(fd, "work_start_time"),
    work_end_time: str(fd, "work_end_time"),
    break_max_minutes: str(fd, "break_max_minutes"),
    default_radius_meters: str(fd, "default_radius_meters"),
    max_location_accuracy_meters: str(fd, "max_location_accuracy_meters"),
    timezone: str(fd, "timezone"),
    work_days: fd.getAll("work_days").map(String),
    cycle_start_day: str(fd, "cycle_start_day"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.work_start_time >= parsed.data.work_end_time) return { error: "Masa mula mesti sebelum masa tamat." };
  const { error } = await supabase.from("system_settings").update(parsed.data).eq("id", 1);
  if (error) return { error: /time zone/i.test(error.message) ? "Zon masa tidak sah." : "Simpan gagal." };
  revalidatePath("/", "layout");
  return { ok: "Tetapan disimpan. Rekod baharu akan menggunakan tetapan ini." };
}

export async function recomputeDays(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const from = str(fd, "from");
  const to = str(fd, "to");
  if (!from || !to || from > to) return { error: "Julat tarikh tidak sah." };
  const { data, error } = await supabase.rpc("admin_recompute_days", { p_from: from, p_to: to });
  if (error) return { error: "Kiraan semula gagal." };
  revalidatePath("/", "layout");
  return { ok: `${data} hari dikira semula.` };
}

export async function addHoliday(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const date = str(fd, "holiday_date");
  const name = str(fd, "name");
  if (!date || !name) return { error: "Tarikh dan nama cuti diperlukan." };
  const { error } = await supabase.from("public_holidays").upsert({ holiday_date: date, name });
  if (error) return { error: "Cuti tidak dapat disimpan." };
  revalidatePath("/admin/settings");
  return { ok: "Cuti ditambah." };
}

export async function deleteHoliday(fd: FormData) {
  const { supabase } = await requireRole("admin");
  await supabase.from("public_holidays").delete().eq("holiday_date", str(fd, "holiday_date"));
  revalidatePath("/admin/settings");
}

// -------------------------------------------------------------- corrections

export async function correctAttendance(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireRole("admin");
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Tarikh tidak sah." };
  const offset = tzOffset(date, (await getSettings(supabase)).timezone);
  const at = (k: string) => {
    const t = str(fd, k);
    return /^\d{2}:\d{2}$/.test(t) ? `${date}T${t}:00${offset}` : null;
  };
  const { data, error } = await supabase.rpc("admin_correct_attendance", {
    p_employee_id: str(fd, "employee_id"),
    p_date: date,
    p_work_in_at: at("work_in"),
    p_break_out_at: at("break_out"),
    p_break_in_at: at("break_in"),
    p_work_out_at: at("work_out"),
    p_reason: str(fd, "reason"),
  });
  if (error) return { error: "Pembetulan gagal." };
  if (!data.ok) return { error: data.message };
  revalidatePath("/", "layout");
  redirect(`/admin/attendance/${data.day.id}?saved=1`);
}
