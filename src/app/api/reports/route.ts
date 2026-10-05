import { getSession } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import {
  buildDayBoard, getActiveEmployees, getBranchNames, getDayReports, getMonthlySummary, getSettings, pickMonth,
} from "@/lib/data";
import {
  ARRIVAL_LABEL, BREAK_LABEL, COMPLETION_LABEL, DEPARTURE_LABEL, formatTime, isDate, todayIn,
} from "@/lib/format";
import { SUMMARY_COLUMNS } from "@/components/monthly-summary-table";

// CSV export of the daily or monthly report. RLS scopes the data to the caller.
export async function GET(request: Request) {
  const { supabase, profile } = await getSession();
  if (!profile || !profile.is_active || profile.role === "staff") {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(request.url);
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  // Managers are always limited to their own branch.
  const branchId = profile.role === "manager" ? profile.branch_id : url.searchParams.get("branch") || null;

  let filename: string;
  let csv: string;
  if (url.searchParams.get("type") === "daily") {
    const dateParam = url.searchParams.get("date") ?? "";
    const date = isDate(dateParam) ? dateParam : todayIn(tz);
    const [employees, reports, branchNames] = await Promise.all([
      getActiveEmployees(supabase, branchId),
      getDayReports(supabase, { from: date, to: date, branchId: branchId ?? undefined }),
      getBranchNames(supabase),
    ]);
    const rows = buildDayBoard(employees, reports, date, branchNames);
    filename = `kehadiran-harian-${date}.csv`;
    csv = toCsv(
      ["Tarikh", "Cawangan", "No. pekerja", "Nama", "Masuk", "Status ketibaan", "Minit lewat", "Minit awal",
        "Mula rehat", "Tamat rehat", "Tempoh rehat (minit)", "Lebih rehat (minit)", "Keluar",
        "Status kepulangan", "Minit balik awal", "Status"],
      rows.map((r) => [
        date, r.branch_name, r.employee_code, r.full_name, formatTime(r.work_in_at, tz),
        r.arrival_status ? ARRIVAL_LABEL[r.arrival_status] : "", r.late_minutes, r.early_arrival_minutes,
        formatTime(r.break_out_at, tz), formatTime(r.break_in_at, tz), r.break_duration_minutes ?? "",
        r.excess_break_minutes, formatTime(r.work_out_at, tz),
        r.departure_status && r.work_out_at ? DEPARTURE_LABEL[r.departure_status] : "",
        r.early_departure_minutes,
        r.missing ? (date < todayIn(tz) ? "Tidak hadir" : "Belum masuk")
          : `${COMPLETION_LABEL[r.effective_status]}${r.break_status ? ` / Rehat: ${BREAK_LABEL[r.break_status]}` : ""}`,
      ]),
    );
  } else {
    const month = pickMonth(url.searchParams.get("month") ?? undefined, tz);
    const rows = await getMonthlySummary(supabase, month, { branchId });
    filename = `kehadiran-bulanan-${month}.csv`;
    csv = toCsv(
      ["Bulan", "Cawangan", "No. pekerja", "Nama", ...SUMMARY_COLUMNS.map((c) => c.label + (c.minutes ? " (minit)" : ""))],
      rows.map((r) => [month, r.branch_name, r.employee_code, r.full_name, ...SUMMARY_COLUMNS.map((c) => r[c.key] as number)]),
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
