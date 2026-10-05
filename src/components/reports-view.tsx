import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDayBoard, countBoard, getActiveEmployees, getBranchNames, getDayReports, getMonthlySummary, pickMonth,
} from "@/lib/data";
import { formatDate, formatMonth, isDate, todayIn } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { AttendanceTable } from "./attendance-table";
import { BoardStats } from "./board-stats";
import { DateInput, FilterBar, FilterField, MonthInput, SelectInput } from "./filters";
import { MonthlySummaryTable } from "./monthly-summary-table";
import { PageTitle, buttonClass } from "./ui";

type Search = Record<string, string | string[] | undefined>;

// Daily and monthly reports. Managers pass a fixed branch; admins may filter.
export async function ReportsView({
  supabase,
  settings,
  search,
  fixedBranchId,
  employeeHref,
}: {
  supabase: SupabaseClient;
  settings: Settings;
  search: Search;
  fixedBranchId?: string | null;
  employeeHref: (employeeId: string) => string;
}) {
  const tz = settings.timezone;
  const today = todayIn(tz);
  const type = search.type === "daily" ? "daily" : "monthly";
  const month = pickMonth(search.month, tz);
  const date = typeof search.date === "string" && isDate(search.date) ? search.date : today;
  const branchId = fixedBranchId ?? (typeof search.branch === "string" && search.branch ? search.branch : null);
  const branchNames = await getBranchNames(supabase);

  const csv = new URLSearchParams({ type, month, date, ...(branchId && !fixedBranchId ? { branch: branchId } : {}) });

  let body;
  if (type === "monthly") {
    const rows = await getMonthlySummary(supabase, month, { branchId });
    body = <MonthlySummaryTable rows={rows} showBranch={!branchId} employeeHref={(r) => employeeHref(r.employee_id)} />;
  } else {
    const [employees, reports] = await Promise.all([
      getActiveEmployees(supabase, branchId),
      getDayReports(supabase, { from: date, to: date, branchId: branchId ?? undefined }),
    ]);
    const rows = buildDayBoard(employees, reports, date, branchNames);
    body = (
      <>
        <BoardStats counts={countBoard(rows)} past={date < today} />
        <AttendanceTable rows={rows} tz={tz} today={today} show={{ employee: true, branch: !branchId }}
          employeeHref={(r) => employeeHref(r.employee_id)} />
      </>
    );
  }

  return (
    <div>
      <PageTitle
        title={type === "monthly" ? "Laporan bulanan" : "Laporan harian"}
        subtitle={[
          type === "monthly" ? formatMonth(month) : formatDate(date, { dateStyle: "full" }),
          branchId ? branchNames.get(branchId) : "Semua cawangan",
        ].join(" · ")}
        actions={<a href={`/api/reports?${csv}`} className={buttonClass("secondary")}>Muat turun CSV</a>}
      />
      <FilterBar>
        <FilterField label="Laporan">
          <SelectInput name="type" value={type} options={[{ value: "monthly", label: "Bulanan" }, { value: "daily", label: "Harian" }]} />
        </FilterField>
        <FilterField label="Bulan (bulanan)"><MonthInput value={month} /></FilterField>
        <FilterField label="Tarikh (harian)"><DateInput value={date} /></FilterField>
        {!fixedBranchId && (
          <FilterField label="Cawangan">
            <SelectInput name="branch" value={branchId ?? ""} allLabel="Semua cawangan"
              options={[...branchNames].map(([value, label]) => ({ value, label }))} />
          </FilterField>
        )}
      </FilterBar>
      {body}
    </div>
  );
}
