import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDayBoard, getActiveEmployees, getBranchNames, getDayReports, getRangeSummary,
} from "@/lib/data";
import { formatRange, minutes, pickRange, quickRanges, todayIn } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { AttendanceTable } from "./attendance-table";
import { Icon, type IconName } from "./icons";
import { RangeFilter } from "./range-filter";
import { SummaryList } from "./summary-list";
import { Card } from "./ui";

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
  const { from, to } = pickRange(search.from, search.to, today, settings.cycle_start_day);
  const branchId = fixedBranchId ?? (typeof search.branch === "string" && search.branch ? search.branch : null);
  const tab = search.tab === "daily" ? "daily" : "summary";
  const branchParam: Record<string, string> = branchId && !fixedBranchId ? { branch: branchId } : {};
  const href = (extra: Record<string, string>) =>
    `${basePath}?${new URLSearchParams({ from, to, tab, ...branchParam, ...extra })}`;
  const csv = (type: string) => `/api/reports?${new URLSearchParams({ type, from, to, ...branchParam })}`;
  const singleDay = from === to;

  const [branchNames, summary, reports, employees] = await Promise.all([
    getBranchNames(supabase),
    getRangeSummary(supabase, { from, to }, { branchId }),
    tab === "daily" ? getDayReports(supabase, { from, to, branchId: branchId ?? undefined }) : Promise.resolve([]),
    tab === "daily" && singleDay ? getActiveEmployees(supabase, branchId) : Promise.resolve([]),
  ]);
  const dayRows = tab === "daily" && singleDay ? buildDayBoard(employees, reports, from, branchNames) : reports;

  const sum = (k: keyof (typeof summary)[number]) => summary.reduce((n, r) => n + (r[k] as number), 0);
  const totals: { label: string; value: number; note?: string; icon: IconName; bad?: boolean }[] = [
    { label: "Hari hadir", value: sum("recorded_days"), icon: "check" },
    { label: "Tidak hadir", value: sum("absent_days"), icon: "user", bad: true },
    { label: "Lewat", value: sum("late_arrivals"), note: minutes(sum("total_late_minutes")), icon: "clock", bad: true },
    { label: "Rehat lebih", value: sum("excess_breaks"), note: minutes(sum("total_excess_break_minutes")), icon: "coffee", bad: true },
    { label: "Balik awal", value: sum("early_departures"), note: minutes(sum("total_early_departure_minutes")), icon: "logout", bad: true },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Laporan</h1>
        <p className="text-sm text-muted">
          {formatRange(from, to)} · {branchId ? branchNames.get(branchId) : "Semua cawangan"} · {summary.length} pekerja
        </p>
      </div>

      <Card className="no-print space-y-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {quickRanges(today, settings.cycle_start_day).map((q) => {
            const active = q.from === from && q.to === to;
            return (
              <Link
                key={q.label}
                href={href({ from: q.from, to: q.to })}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  active ? "border-brand bg-brand text-brand-fg" : "border-border bg-white text-foreground hover:bg-neutral-bg"
                }`}
              >
                {q.label}
              </Link>
            );
          })}
        </div>
        <RangeFilter
          basePath={basePath}
          from={from}
          to={to}
          today={today}
          branchId={branchId}
          branches={fixedBranchId ? undefined : [...branchNames].map(([value, label]) => ({ value, label }))}
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {totals.map((t) => (
          <Card key={t.label} className={`!p-3 ${t.bad && t.value > 0 ? "!border-bad/30 !bg-bad-bg" : ""}`}>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Icon name={t.icon} className="h-3.5 w-3.5" />
              {t.label}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${t.bad && t.value > 0 ? "text-bad" : ""}`}>{t.value}</div>
            {t.note && t.value > 0 && <div className="text-xs text-muted">{t.note}</div>}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-neutral-bg p-1 text-sm font-medium">
          {([["summary", "Ikut pekerja"], ["daily", "Ikut hari"]] as const).map(([key, label]) => (
            <Link
              key={key}
              href={href({ tab: key })}
              className={`rounded-lg px-4 py-1.5 ${tab === key ? "bg-white text-foreground shadow-sm" : "text-muted"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <a href={csv(tab === "daily" ? "daily" : "summary")}
          className="no-print inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-bg">
          ⬇ Muat turun Excel (CSV)
        </a>
      </div>

      {tab === "summary" ? (
        <SummaryList rows={summary} showBranch={!branchId} hrefBase={employeeHref("")} />
      ) : (
        <AttendanceTable
          rows={dayRows}
          tz={tz}
          today={today}
          show={{ date: !singleDay, employee: true, branch: !branchId }}
          employeeHref={(r) => employeeHref(r.employee_id)}
        />
      )}
    </div>
  );
}
