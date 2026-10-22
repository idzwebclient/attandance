import { getSession } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { csvResponse } from "@/lib/csv-response";
import { getBranchNames, getLeaveBalances, getLeavePolicies, getSettings } from "@/lib/data";
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, todayIn } from "@/lib/format";
import type { LeaveRequest, LeaveType } from "@/lib/types";

// CSV of leave for a year: ?type=requests (every application) or balances (per
// employee and type). Admins may filter ?branch=; managers always get their own branch.
export async function GET(request: Request) {
  const { supabase, profile } = await getSession();
  if (!profile || !profile.is_active || profile.role === "staff") return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const settings = await getSettings(supabase);
  const today = todayIn(settings.timezone);
  const year = Number(url.searchParams.get("year")) || Number(today.slice(0, 4));
  const branch = profile.role === "manager" ? profile.branch_id : url.searchParams.get("branch") || null;
  const branchNames = await getBranchNames(supabase);
  const branchSlug = branch ? `-${(branchNames.get(branch) ?? "cawangan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";

  let people = supabase.from("profiles").select("id, full_name, employee_code, branch_id, is_active")
    .in("role", ["staff", "manager"]).order("full_name");
  if (branch) people = people.eq("branch_id", branch);
  const { data: peopleData } = await people;
  const staff = (peopleData ?? []) as { id: string; full_name: string; employee_code: string; branch_id: string | null; is_active: boolean }[];
  const byId = new Map(staff.map((p) => [p.id, p]));
  const branchOf = (id: string | null) => (id && branchNames.get(id)) || "";

  if (url.searchParams.get("type") === "balances") {
    const [balances, policies] = await Promise.all([getLeaveBalances(supabase, year), getLeavePolicies(supabase)]);
    const types = (Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).filter((t) => policies.get(t)?.is_active ?? true);
    const rows = staff.filter((p) => p.is_active).flatMap((p) => types.map((t) => {
      const b = balances.get(`${p.id}:${t}`);
      const carryLeft = b && today < b.carry_expires ? b.carried_days - b.carried_used : 0;
      return [
        year, branchOf(p.branch_id), p.employee_code, p.full_name, LEAVE_TYPE_LABEL[t],
        b?.limit_days ?? "Tiada had", b?.carried_days ?? 0, (b?.used_days ?? 0) + (b?.carried_used ?? 0),
        b?.limit_days == null ? "" : Math.max(b.limit_days + carryLeft - b.used_days, 0),
      ];
    }));
    return csvResponse(
      toCsv(["Tahun", "Cawangan", "No. pekerja", "Nama", "Jenis cuti", "Had setahun (hari)", "Bawaan (hari)",
        "Sudah guna (hari)", "Baki (hari)"], rows),
      `baki-cuti-${year}${branchSlug}.csv`,
    );
  }

  const { data } = await supabase.from("leave_requests").select("*")
    .lte("start_date", `${year}-12-31`).gte("end_date", `${year}-01-01`).order("start_date");
  const requests = ((data ?? []) as LeaveRequest[]).filter((r) => byId.has(r.employee_id));
  const { data: deciders } = await supabase.from("profiles").select("id, full_name")
    .in("id", [...new Set(requests.map((r) => r.decided_by).filter(Boolean))] as string[]);
  const deciderName = new Map((deciders ?? []).map((d) => [d.id, d.full_name]));
  const { data: hols } = await supabase.from("public_holidays").select("holiday_date")
    .gte("holiday_date", `${year - 1}-01-01`).lte("holiday_date", `${year + 1}-12-31`);
  const holidays = new Set((hols ?? []).map((h) => h.holiday_date as string));
  // Work days only, as the leave balance counts them.
  const days = (r: LeaveRequest) => {
    let n = 0;
    for (let t = Date.parse(r.end_date), d = Date.parse(r.start_date); d <= t; d += 86_400_000) {
      const iso = new Date(d).toISOString().slice(0, 10);
      const dow = new Date(d).getUTCDay() || 7;
      if (settings.work_days.includes(dow) && !holidays.has(iso)) n++;
    }
    return n;
  };
  return csvResponse(
    toCsv(
      ["Cawangan", "No. pekerja", "Nama", "Jenis cuti", "Dari", "Hingga", "Hari bekerja", "Sebab", "Status",
        "Diputuskan oleh", "Tarikh keputusan", "Catatan keputusan", "Tarikh mohon"],
      requests.map((r) => {
        const p = byId.get(r.employee_id)!;
        return [
          branchOf(r.branch_id ?? p.branch_id), p.employee_code, p.full_name, LEAVE_TYPE_LABEL[r.leave_type],
          r.start_date, r.end_date, days(r), r.reason, LEAVE_STATUS_LABEL[r.status],
          r.decided_by ? deciderName.get(r.decided_by) ?? "" : "", r.decided_at?.slice(0, 10), r.decision_note,
          r.created_at.slice(0, 10),
        ];
      }),
    ),
    `permohonan-cuti-${year}${branchSlug}.csv`,
  );
}
