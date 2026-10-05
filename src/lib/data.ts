import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TZ, isMonth, periodOf, periodRange, todayIn } from "./format";
import type { AttendanceDayReport, BoardRow, MonthlySummaryRow, Settings } from "./types";

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase.from("system_settings").select("*").eq("id", 1).single<Settings>();
  return (
    data ?? {
      work_start_time: "09:00:00",
      work_end_time: "18:00:00",
      break_max_minutes: 60,
      default_radius_meters: 100,
      max_location_accuracy_meters: 100,
      timezone: DEFAULT_TZ,
      work_days: [1, 2, 3, 4, 5],
      cycle_start_day: 1,
    }
  );
}

// Current reporting period (see periodRange) in the company timezone.
export function currentMonth(settings: Settings) {
  return periodOf(todayIn(settings.timezone), settings.cycle_start_day);
}

export function pickMonth(value: unknown, settings: Settings) {
  return typeof value === "string" && isMonth(value) ? value : currentMonth(settings);
}

export async function getDayReports(
  supabase: SupabaseClient,
  filter: { from: string; to: string; employeeId?: string; branchId?: string },
) {
  let q = supabase
    .from("attendance_day_report")
    .select("*")
    .gte("attendance_date", filter.from)
    .lte("attendance_date", filter.to);
  if (filter.employeeId) q = q.eq("employee_id", filter.employeeId);
  if (filter.branchId) q = q.eq("branch_id", filter.branchId);
  const { data, error } = await q.order("attendance_date", { ascending: false }).order("full_name").limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as AttendanceDayReport[];
}

export async function getMonthReports(
  supabase: SupabaseClient,
  month: string,
  settings: Settings,
  f: { employeeId?: string; branchId?: string } = {},
) {
  return getDayReports(supabase, { ...periodRange(month, settings.cycle_start_day), ...f });
}

export async function getMonthlySummary(
  supabase: SupabaseClient,
  month: string,
  settings: Settings,
  f: { branchId?: string | null; employeeId?: string | null } = {},
) {
  return getRangeSummary(supabase, periodRange(month, settings.cycle_start_day), f);
}

// One row per active employee for a date: their attendance, or a `missing` row.
export function buildDayBoard(
  employees: { id: string; full_name: string; employee_code: string; branch_id: string | null }[],
  reports: AttendanceDayReport[],
  date: string,
  branchNames: Map<string, string>,
) {
  const byEmployee = new Map(reports.map((r) => [r.employee_id, r]));
  const rows: BoardRow[] = employees.map((e) =>
    byEmployee.get(e.id) ?? {
      id: `missing-${e.id}`,
      missing: true,
      employee_id: e.id,
      branch_id: e.branch_id ?? "",
      attendance_date: date,
      work_in_at: null,
      break_out_at: null,
      break_in_at: null,
      work_out_at: null,
      arrival_status: null,
      early_arrival_minutes: 0,
      late_minutes: 0,
      break_status: null,
      break_duration_minutes: null,
      excess_break_minutes: 0,
      departure_status: null,
      early_departure_minutes: 0,
      completion_status: "NOT_STARTED",
      extra_minutes: 0,
      extra_open: false,
      effective_status: "NOT_STARTED",
      full_name: e.full_name,
      employee_code: e.employee_code,
      branch_name: (e.branch_id && branchNames.get(e.branch_id)) || "—",
    },
  );
  // Employees who punched but are no longer in the active list (moved or deactivated).
  const listed = new Set(employees.map((e) => e.id));
  rows.push(...reports.filter((r) => !listed.has(r.employee_id)));
  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function countBoard(rows: { missing?: boolean; effective_status: string; arrival_status: string | null; break_status: string | null; departure_status: string | null; work_out_at: string | null }[]) {
  return {
    total: rows.length,
    notIn: rows.filter((r) => r.missing).length,
    late: rows.filter((r) => r.arrival_status === "LATE").length,
    onBreak: rows.filter((r) => r.effective_status === "ON_BREAK").length,
    working: rows.filter((r) => r.effective_status === "WORKING" || r.effective_status === "RETURNED_FROM_BREAK").length,
    exceeded: rows.filter((r) => r.break_status === "BREAK_EXCEEDED").length,
    completed: rows.filter((r) => r.effective_status === "COMPLETED").length,
    earlyOut: rows.filter((r) => r.departure_status === "EARLY_DEPARTURE" && r.work_out_at).length,
    incomplete: rows.filter((r) => r.effective_status === "INCOMPLETE").length,
  };
}

export async function getActiveEmployees(supabase: SupabaseClient, branchId?: string | null) {
  let q = supabase
    .from("profiles")
    .select("id, full_name, employee_code, branch_id, role, is_active")
    .in("role", ["staff", "manager"])
    .eq("is_active", true);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q.order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBranchNames(supabase: SupabaseClient) {
  const { data } = await supabase.from("branches").select("id, name").order("name");
  return new Map((data ?? []).map((b) => [b.id as string, b.name as string]));
}

export async function getRangeSummary(
  supabase: SupabaseClient,
  range: { from: string; to: string },
  f: { branchId?: string | null; employeeId?: string | null } = {},
) {
  const { data, error } = await supabase.rpc("attendance_summary", {
    p_from: range.from,
    p_to: range.to,
    p_branch_id: f.branchId ?? null,
    p_employee_id: f.employeeId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MonthlySummaryRow[];
}
