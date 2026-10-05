import type { Metadata } from "next";
import Link from "next/link";
import { AttendanceTable } from "@/components/attendance-table";
import { BoardStats } from "@/components/board-stats";
import { DateInput, FilterBar, FilterField, MonthInput, SelectInput } from "@/components/filters";
import { buttonClass, PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import {
  buildDayBoard, countBoard, getActiveEmployees, getBranchNames, getDayReports, getMonthReports, getSettings, pickMonth,
} from "@/lib/data";
import { formatDate, formatPeriod, isDate, todayIn } from "@/lib/format";

export const metadata: Metadata = { title: "Kehadiran" };

export default async function AdminAttendance({ searchParams }: PageProps<"/admin/attendance">) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getSettings(supabase);
  const today = todayIn(settings.timezone);
  const view = sp.view === "month" ? "month" : "day";
  const date = typeof sp.date === "string" && isDate(sp.date) ? sp.date : today;
  const month = pickMonth(sp.month, settings);
  const branchId = typeof sp.branch === "string" && sp.branch ? sp.branch : undefined;
  const employeeId = typeof sp.employee === "string" && sp.employee ? sp.employee : undefined;

  const [branchNames, allEmployees] = await Promise.all([getBranchNames(supabase), getActiveEmployees(supabase)]);
  const employees = allEmployees.filter(
    (e) => (!branchId || e.branch_id === branchId) && (!employeeId || e.id === employeeId),
  );

  let content;
  if (view === "day") {
    const reports = await getDayReports(supabase, { from: date, to: date, branchId, employeeId });
    const board = buildDayBoard(employees, reports, date, branchNames);
    content = (
      <>
        <BoardStats counts={countBoard(board)} past={date < today} />
        <AttendanceTable
          rows={board}
          tz={settings.timezone}
          today={today}
          show={{ employee: true, branch: !branchId }}
          employeeHref={(r) => `/admin/employees/${r.employee_id}`}
          dayHref={(r) => (r.missing ? `/admin/attendance/new?employee=${r.employee_id}&date=${date}` : `/admin/attendance/${r.id}`)}
        />
      </>
    );
  } else {
    const rows = await getMonthReports(supabase, month, settings, { branchId, employeeId });
    content = (
      <AttendanceTable
        rows={rows}
        tz={settings.timezone}
        show={{ date: true, employee: true, branch: !branchId }}
        employeeHref={(r) => `/admin/employees/${r.employee_id}`}
        dayHref={(r) => `/admin/attendance/${r.id}`}
      />
    );
  }

  return (
    <div>
      <PageTitle
        title="Kehadiran"
        subtitle={view === "day" ? formatDate(date, { dateStyle: "full" }) : formatPeriod(month, settings.cycle_start_day)}
        actions={<Link href="/admin/attendance/new" className={buttonClass("secondary")}>Tambah / betulkan rekod</Link>}
      />
      <FilterBar>
        <FilterField label="Paparan">
          <SelectInput name="view" value={view} options={[{ value: "day", label: "Harian" }, { value: "month", label: "Bulanan" }]} />
        </FilterField>
        <FilterField label="Tarikh (harian)"><DateInput value={date} /></FilterField>
        <FilterField label="Bulan (bulanan)"><MonthInput value={month} /></FilterField>
        <FilterField label="Cawangan">
          <SelectInput name="branch" value={branchId ?? ""} allLabel="Semua cawangan"
            options={[...branchNames].map(([value, label]) => ({ value, label }))} />
        </FilterField>
        <FilterField label="Pekerja">
          <SelectInput name="employee" value={employeeId ?? ""} allLabel="Semua pekerja"
            options={allEmployees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
        </FilterField>
      </FilterBar>
      {content}
    </div>
  );
}
