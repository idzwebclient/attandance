import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDayBoard, countBoard, getActiveEmployees, getBranchNames, getDayReports, getRangeSummary,
} from "@/lib/data";
import { formatRange, pickRange, quickRanges, todayIn } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { AttendanceTable } from "./attendance-table";
import { BoardStats } from "./board-stats";
import { FilterBar, FilterField, SelectInput } from "./filters";
import { MonthlySummaryTable } from "./monthly-summary-table";
import { PageTitle, buttonClass, inputClass } from "./ui";

type Search = Record<string, string | string[] | undefined>;

// Attendance report for any date range. Managers pass a fixed branch; admins may filter.
export async function ReportsView({
  supabase,
  settings,
  search,
  basePath,
  fixedBranchId,
  employeeHref,
}: {
  supabase: SupabaseClient;
  settings: Settings;
  search: Search;
  basePath: string;
  fixedBranchId?: string | null;
  employeeHref: (employeeId: string) => string;
}) {
  const tz = settings.timezone;
  const today = todayIn(tz);
  const { from, to } = pickRange(search.from, search.to, today);
  const branchId = fixedBranchId ?? (typeof search.branch === "string" && search.branch ? search.branch : null);
  const branchParam: Record<string, string> = branchId && !fixedBranchId ? { branch: branchId } : {};
  const query = (extra: Record<string, string>) => new URLSearchParams({ ...extra, ...branchParam }).toString();
  const singleDay = from === to;

  const [branchNames, summary, reports, employees] = await Promise.all([
    getBranchNames(supabase),
    getRangeSummary(supabase, { from, to }, { branchId }),
    getDayReports(supabase, { from, to, branchId: branchId ?? undefined }),
    singleDay ? getActiveEmployees(supabase, branchId) : Promise.resolve([]),
  ]);
  const dayRows = singleDay ? buildDayBoard(employees, reports, from, branchNames) : reports;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Laporan kehadiran"
        subtitle={[formatRange(from, to), branchId ? branchNames.get(branchId) : "Semua cawangan"].join(" · ")}
        actions={
          <>
            <a href={`/api/reports?${query({ type: "summary", from, to })}`} className={buttonClass("secondary")}>CSV ringkasan</a>
            <a href={`/api/reports?${query({ type: "daily", from, to })}`} className={buttonClass("secondary")}>CSV harian</a>
          </>
        }
      />

      <div className="no-print space-y-3">
        <div className="flex flex-wrap gap-2">
          {quickRanges(today).map((q) => {
            const active = q.from === from && q.to === to;
            return (
              <Link
                key={q.label}
                href={`${basePath}?${query({ from: q.from, to: q.to })}`}
                className={`rounded-full border px-3 py-1 text-sm ${active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:bg-neutral-bg"}`}
              >
                {q.label}
              </Link>
            );
          })}
        </div>
        <FilterBar>
          <FilterField label="Dari">
            <input type="date" name="from" defaultValue={from} max={today} className={inputClass} required />
          </FilterField>
          <FilterField label="Hingga">
            <input type="date" name="to" defaultValue={to} max={today} className={inputClass} required />
          </FilterField>
          {!fixedBranchId && (
            <FilterField label="Cawangan">
              <SelectInput name="branch" value={branchId ?? ""} allLabel="Semua cawangan"
                options={[...branchNames].map(([value, label]) => ({ value, label }))} />
            </FilterField>
          )}
        </FilterBar>
      </div>

      {singleDay && <BoardStats counts={countBoard(dayRows)} past={from < today} />}

      <section className="space-y-2">
        <h2 className="font-medium">Ringkasan setiap pekerja</h2>
        <MonthlySummaryTable rows={summary} showBranch={!branchId} employeeHref={(r) => employeeHref(r.employee_id)} />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Rekod harian</h2>
        <AttendanceTable
          rows={dayRows}
          tz={tz}
          today={today}
          show={{ date: !singleDay, employee: true, branch: !branchId }}
          employeeHref={(r) => employeeHref(r.employee_id)}
        />
      </section>
    </div>
  );
}
