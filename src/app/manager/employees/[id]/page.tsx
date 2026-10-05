import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendanceTable } from "@/components/attendance-table";
import { MonthSwitcher } from "@/components/month-switcher";
import { MonthlySummaryTable } from "@/components/monthly-summary-table";
import { PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { currentMonth, getMonthlySummary, getMonthReports, getSettings, pickMonth } from "@/lib/data";
import { formatMonth } from "@/lib/format";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Sejarah pekerja" };

export default async function ManagerEmployee({ params, searchParams }: PageProps<"/manager/employees/[id]">) {
  const { supabase } = await requireRole("manager");
  const { id } = await params;
  // RLS returns nothing for employees outside the manager's branch.
  const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!p) notFound();
  const settings = await getSettings(supabase);
  const month = pickMonth((await searchParams).month, settings.timezone);
  const [rows, summary] = await Promise.all([
    getMonthReports(supabase, month, { employeeId: p.id }),
    getMonthlySummary(supabase, month, { employeeId: p.id }),
  ]);
  return (
    <div className="space-y-4">
      <PageTitle title={p.full_name} subtitle={`${p.employee_code} · ${formatMonth(month)}`} />
      <MonthSwitcher month={month} current={currentMonth(settings.timezone)} href={(m) => `/manager/employees/${p.id}?month=${m}`} />
      <MonthlySummaryTable rows={summary} />
      <AttendanceTable rows={rows} tz={settings.timezone} show={{ date: true }} />
    </div>
  );
}
