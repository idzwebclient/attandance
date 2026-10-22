import { getSession } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { csvResponse } from "@/lib/csv-response";
import { getBranchNames } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

const ROLE = { staff: "Staf", manager: "Manager", admin: "Admin" } as const;

// CSV of every employee with their details. Admin only; ?branch=<id>|none filters.
export async function GET(request: Request) {
  const { supabase, profile } = await getSession();
  if (!profile || !profile.is_active || profile.role !== "admin") return new Response("Forbidden", { status: 403 });
  const branch = new URL(request.url).searchParams.get("branch");

  let q = supabase.from("profiles").select("*").order("full_name");
  if (branch === "none") q = q.is("branch_id", null);
  else if (branch) q = q.eq("branch_id", branch);
  const [{ data }, branchNames, users] = await Promise.all([
    q,
    getBranchNames(supabase),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email]));
  const rows = ((data ?? []) as Profile[]).sort((a, b) =>
    ((a.branch_id && branchNames.get(a.branch_id)) || "~").localeCompare((b.branch_id && branchNames.get(b.branch_id)) || "~")
    || Number(b.role === "manager") - Number(a.role === "manager")
    || a.full_name.localeCompare(b.full_name));

  const csv = toCsv(
    ["Cawangan", "No. pekerja", "Nama", "Peranan", "No. telefon", "No. IC", "Emel", "Tarikh mula kerja",
      "Tarikh tamat percubaan", "Cuti tahunan khas (hari)", "Punch tanpa QR", "Status"],
    rows.map((p) => [
      (p.branch_id && branchNames.get(p.branch_id)) || "", p.employee_code, p.full_name, ROLE[p.role],
      p.phone, p.ic_number, emails.get(p.auth_user_id), p.hire_date, p.probation_end_date, p.annual_leave_days,
      p.role === "manager" && p.qr_exempt ? "Ya" : "", p.is_active ? "Aktif" : "Tidak aktif",
    ]),
  );
  const suffix = branch === "none" ? "-tiada-cawangan" : branch ? `-${(branchNames.get(branch) ?? "cawangan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
  return csvResponse(csv, `pekerja${suffix}.csv`);
}
