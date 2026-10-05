import type { Metadata } from "next";
import { AttendanceTable } from "@/components/attendance-table";
import { MonthSwitcher } from "@/components/month-switcher";
import { Card, PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { currentMonth, getMonthlySummary, getMonthReports, getSettings, pickMonth } from "@/lib/data";
import { minutes } from "@/lib/format";

export const metadata: Metadata = { title: "Sejarah" };

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const { supabase, profile } = await requireRole("staff", "manager");
  const settings = await getSettings(supabase);
  const month = pickMonth((await searchParams).month, settings);
  const [rows, [summary]] = await Promise.all([
    getMonthReports(supabase, month, settings, { employeeId: profile.id }),
    getMonthlySummary(supabase, month, settings, { employeeId: profile.id }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle title="Sejarah kehadiran" />
      <MonthSwitcher month={month} startDay={settings.cycle_start_day} current={currentMonth(settings)} href={(m) => `/history?month=${m}`} />
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Hari hadir" value={summary.recorded_days} />
          <Stat label="Lewat" value={summary.late_arrivals} note={minutes(summary.total_late_minutes)} bad={summary.late_arrivals > 0} />
          <Stat label="Rehat lebih" value={summary.excess_breaks} note={minutes(summary.total_excess_break_minutes)} bad={summary.excess_breaks > 0} />
          <Stat label="Balik awal" value={summary.early_departures} note={minutes(summary.total_early_departure_minutes)} bad={summary.early_departures > 0} />
        </div>
      )}
      <AttendanceTable rows={rows} tz={settings.timezone} show={{ date: true }} />
    </div>
  );
}

function Stat({ label, value, note, bad }: { label: string; value: number; note?: string; bad?: boolean }) {
  return (
    <Card className="!p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${bad ? "text-bad" : ""}`}>{value}</div>
      {note && value > 0 && <div className="text-xs text-muted">{note}</div>}
    </Card>
  );
}
