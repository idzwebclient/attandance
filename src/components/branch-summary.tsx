import Link from "next/link";
import { minutes } from "@/lib/format";
import type { MonthlySummaryRow } from "@/lib/types";
import { Empty } from "./ui";

type Totals = {
  id: string;
  name: string;
  staff: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  lateMins: number;
  breaks: number;
  earlyOut: number;
  incomplete: number;
};

const COLS: { label: string; get: (t: Totals) => number; note?: (t: Totals) => string; bad?: boolean }[] = [
  { label: "Pekerja", get: (t) => t.staff },
  { label: "Hadir", get: (t) => t.present },
  { label: "Tidak hadir", get: (t) => t.absent, bad: true },
  { label: "Cuti", get: (t) => t.leave },
  { label: "Lewat", get: (t) => t.late, note: (t) => minutes(t.lateMins), bad: true },
  { label: "Rehat lebih", get: (t) => t.breaks, bad: true },
  { label: "Balik awal", get: (t) => t.earlyOut, bad: true },
  { label: "Tak lengkap", get: (t) => t.incomplete, bad: true },
];

// One row per branch, so admins can spot the problem branch before drilling in.
export function BranchSummary({ rows, branchHref }: { rows: MonthlySummaryRow[]; branchHref: (branchId: string) => string }) {
  const byBranch = new Map<string, Totals>();
  for (const r of rows) {
    const id = r.branch_id ?? "";
    const t = byBranch.get(id) ?? {
      id, name: r.branch_name ?? "Tiada cawangan", staff: 0, present: 0, absent: 0, leave: 0,
      late: 0, lateMins: 0, breaks: 0, earlyOut: 0, incomplete: 0,
    };
    t.staff += 1;
    t.present += r.recorded_days;
    t.absent += r.absent_days;
    t.leave += r.leave_days;
    t.late += r.late_arrivals;
    t.lateMins += r.total_late_minutes;
    t.breaks += r.excess_breaks;
    t.earlyOut += r.early_departures;
    t.incomplete += r.incomplete_days;
    byBranch.set(id, t);
  }
  const list = [...byBranch.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return <Empty>Tiada data.</Empty>;

  const cell = (c: (typeof COLS)[number], t: Totals) => {
    const v = c.get(t);
    if (!v) return <span className="text-muted">—</span>;
    return (
      <span className={c.bad ? "font-semibold text-bad" : "font-semibold"}>
        {v}{c.note && <span className="ml-1 text-xs font-normal text-muted">({c.note(t)})</span>}
      </span>
    );
  };

  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {list.map((t) => (
          <li key={t.id}>
            <Link href={branchHref(t.id)} className="block rounded-2xl border border-border bg-surface p-3 shadow-sm active:bg-neutral-bg">
              <div className="flex items-center justify-between">
                <span className="font-medium text-brand">{t.name}</span>
                <span className="text-xs text-muted">{t.staff} pekerja ›</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COLS.slice(1).filter((c) => c.get(t) > 0).map((c) => (
                  <span key={c.label} className={`rounded-full px-2 py-0.5 text-xs ${c.bad ? "bg-bad-bg text-bad" : "bg-neutral-bg"}`}>
                    {c.label} <b>{c.get(t)}</b>
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="bg-neutral-bg text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cawangan</th>
              {COLS.map((c) => <th key={c.label} className="whitespace-nowrap px-3 py-3 text-center font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-neutral-bg/50">
                <td className="px-4 py-2.5">
                  <Link href={branchHref(t.id)} className="font-medium text-brand hover:underline">{t.name}</Link>
                </td>
                {COLS.map((c) => <td key={c.label} className="whitespace-nowrap px-3 py-2.5 text-center tabular-nums">{cell(c, t)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Klik nama cawangan untuk lihat pekerja cawangan tersebut.</p>
    </>
  );
}
