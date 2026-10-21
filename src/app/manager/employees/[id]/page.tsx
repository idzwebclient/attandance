import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendanceTable } from "@/components/attendance-table";
import { MonthSwitcher } from "@/components/month-switcher";
import { LeaveBalanceTable } from "@/components/leave-balance-table";
import { MonthlySummaryTable } from "@/components/monthly-summary-table";
import { PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { currentMonth, getMonthlySummary, getMonthReports, getSettings, pickMonth } from "@/lib/data";
import { formatPeriod, todayIn } from "@/lib/format";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Sejarah pekerja" };

export default async function ManagerEmployee({ params, searchParams }: PageProps<"/manager/employees/[id]">) {
  const { supabase } = await requireRole("manager");
  const { id } = await params;
  // RLS returns nothing for employees outside the manager's branch.
  const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!p) notFound();
  const settings = await getSettings(supabase);
  const month = pickMonth((await searchParams).month, settings);
  const [rows, summary] = await Promise.all([
    getMonthReports(supabase, month, settings, { employeeId: p.id }),
    getMonthlySummary(supabase, month, settings, { employeeId: p.id }),
  ]);
  return (
    <div className="space-y-4">
      <PageTitle title={p.full_name} subtitle={`${p.employee_code} · ${formatPeriod(month, settings.cycle_start_day)}`} />
      <section className="space-y-2">
        <h2 className="font-medium">Baki cuti {todayIn(settings.timezone).slice(0, 4)}</h2>
        <LeaveBalanceTable supabase={supabase} today={todayIn(settings.timezone)} employeeId={p.id} />
      </section>
      <MonthSwitcher month={month} startDay={settings.cycle_start_day} current={currentMonth(settings)} href={(m) => `/manager/employees/${p.id}?month=${m}`} />
      <MonthlySummaryTable rows={summary} />
      <AttendanceTable rows={rows} tz={settings.timezone} show={{ date: true }} />
    </div>
  );
}
