"use server";

import { requireRole } from "@/lib/auth";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const { supabase } = await requireRole();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Kata laluan mesti sekurang-kurangnya 8 aksara." };
  if (password !== confirm) return { error: "Kata laluan tidak sepadan." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Kata laluan tidak dapat ditukar. Cuba kata laluan lain." };
  return { ok: true };
}
