import { getSession } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import {
  buildDayBoard, getActiveEmployees, getBranchNames, getDayReports, getRangeSummary, getSettings,
} from "@/lib/data";
import {
  ARRIVAL_LABEL, BREAK_LABEL, COMPLETION_LABEL, DEPARTURE_LABEL, formatTime, pickRange, todayIn,
} from "@/lib/format";
import { SUMMARY_COLUMNS } from "@/components/monthly-summary-table";
import type { BoardRow } from "@/lib/types";

// CSV export of the attendance report for a date range. RLS scopes the data to the caller.
export async function GET(request: Request) {
  const { supabase, profile } = await getSession();
  if (!profile || !profile.is_active || profile.role === "staff") {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(request.url);
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  const today = todayIn(tz);
  const { from, to } = pickRange(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined, today, settings.cycle_start_day);
  // Managers are always limited to their own branch.
  const branchId = profile.role === "manager" ? profile.branch_id : url.searchParams.get("branch") || null;
  const span = from === to ? from : `${from}_${to}`;

  let filename: string;
  let csv: string;
  if (url.searchParams.get("type") === "daily") {
    const [reports, branchNames, employees] = await Promise.all([
      getDayReports(supabase, { from, to, branchId: branchId ?? undefined }),
      getBranchNames(supabase),
      from === to ? getActiveEmployees(supabase, branchId) : Promise.resolve([]),
    ]);
    const rows: BoardRow[] = from === to ? buildDayBoard(employees, reports, from, branchNames) : [...reports].reverse();
    filename = `kehadiran-harian-${span}.csv`;
    csv = toCsv(
      ["Tarikh", "Cawangan", "No. pekerja", "Nama", "Masuk", "Status ketibaan", "Minit lewat", "Minit awal",
        "Mula rehat", "Tamat rehat", "Tempoh rehat (minit)", "Lebih rehat (minit)", "Keluar",
        "Status kepulangan", "Minit balik awal", "Kerja tambahan (minit)", "Kerja luar", "Status"],
      rows.map((r) => [
        r.attendance_date, r.branch_name, r.employee_code, r.full_name, formatTime(r.work_in_at, tz),
        r.arrival_status ? ARRIVAL_LABEL[r.arrival_status] : "", r.late_minutes, r.early_arrival_minutes,
        formatTime(r.break_out_at, tz), formatTime(r.break_in_at, tz), r.break_duration_minutes ?? "",
        r.excess_break_minutes, formatTime(r.work_out_at, tz),
        r.departure_status && r.work_out_at ? DEPARTURE_LABEL[r.departure_status] : "",
        r.early_departure_minutes,
        r.extra_minutes,
        r.is_field_work ? "Ya" : "",
        r.missing ? (r.attendance_date < today ? "Tidak hadir" : "Belum masuk")
          : `${COMPLETION_LABEL[r.effective_status]}${r.break_status ? ` / Rehat: ${BREAK_LABEL[r.break_status]}` : ""}`,
      ]),
    );
  } else {
    const rows = await getRangeSummary(supabase, { from, to }, { branchId });
    filename = `kehadiran-ringkasan-${span}.csv`;
    csv = toCsv(
      ["Dari", "Hingga", "Cawangan", "No. pekerja", "Nama", ...SUMMARY_COLUMNS.map((c) => c.label + (c.minutes ? " (minit)" : ""))],
      rows.map((r) => [from, to, r.branch_name, r.employee_code, r.full_name, ...SUMMARY_COLUMNS.map((c) => r[c.key] as number)]),
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
