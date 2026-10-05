"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Tone } from "@/lib/format";
import { Badge, Empty, inputClass } from "./ui";

export type ListRow = {
  key: string;
  date: string | null;
  name: string | null;
  sub: string | null;
  employeeHref: string | null;
  dayHref: string | null;
  dayLabel: string;
  status: { label: string; tone: Tone };
  group: "notIn" | "absent" | "working" | "break" | "done" | "issue";
  missing: boolean;
  workIn: string;
  breakOut: string;
  breakIn: string;
  breakLength: string | null;
  breakOver: boolean;
  workOut: string;
  late: boolean;
  earlyOut: boolean;
  notes: { label: string; tone: Tone }[];
};

const GROUPS: { key: "all" | ListRow["group"]; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "issue", label: "Ada masalah" },
  { key: "notIn", label: "Belum masuk" },
  { key: "absent", label: "Tidak hadir" },
  { key: "working", label: "Bekerja" },
  { key: "break", label: "Rehat" },
  { key: "done", label: "Selesai" },
];

export function AttendanceList({ rows, searchable }: { rows: ListRow[]; searchable: boolean }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<(typeof GROUPS)[number]["key"]>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.group] = (c[r.group] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = rows.filter((r) => {
    if (group !== "all" && r.group !== group) return false;
    if (!q) return true;
    const hay = `${r.name ?? ""} ${r.sub ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const showName = rows.some((r) => r.name);
  const showDate = rows.some((r) => r.date);
  const showLink = rows.some((r) => r.dayHref);

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="no-print space-y-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau no. pekerja…"
            className={inputClass}
          />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {GROUPS.filter((g) => g.key === "all" || counts[g.key]).map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroup(g.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  group === g.key ? "border-brand bg-brand text-brand-fg" : "border-border bg-white"
                }`}
              >
                {g.label} <span className="opacity-70">{counts[g.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!shown.length ? (
        <Empty>Tiada padanan.</Empty>
      ) : (
        <>
          {/* Phones: one compact row per person */}
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm sm:hidden">
            {shown.map((r) => {
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name ?? r.date}</div>
                      {r.sub && <div className="truncate text-xs text-muted">{r.sub}</div>}
                    </div>
                    <Badge tone={r.status.tone}>{r.status.label}</Badge>
                  </div>
                  {!r.missing && (
                    <div className="mt-1.5 flex items-center gap-3 text-xs tabular-nums text-muted">
                      <span>Masuk <b className={r.late ? "text-bad" : "text-foreground"}>{r.workIn}</b></span>
                      <span>Rehat <b className={r.breakOver ? "text-bad" : "text-foreground"}>{r.breakLength ?? (r.breakOut !== "—" ? "…" : "—")}</b></span>
                      <span>Keluar <b className={r.earlyOut ? "text-bad" : "text-foreground"}>{r.workOut}</b></span>
                    </div>
                  )}
                  {r.notes.some((n) => n.tone === "bad") && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.notes.filter((n) => n.tone === "bad").map((n) => <Badge key={n.label} tone={n.tone}>{n.label}</Badge>)}
                    </div>
                  )}
                </>
              );
              const link = r.dayHref ?? r.employeeHref;
              return (
                <li key={r.key}>
                  {link ? (
                    <Link href={link} className="block px-4 py-3 active:bg-neutral-bg">{body}</Link>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Desktop: aligned table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                {showDate && <col className="w-28" />}
                {showName && <col className="w-56" />}
                <col className="w-36" />
                <col className="w-24" />
                <col className="w-40" />
                <col className="w-24" />
                <col />
                {showLink && <col className="w-24" />}
              </colgroup>
              <thead className="bg-neutral-bg text-xs uppercase tracking-wide text-muted">
                <tr>
                  {showDate && <th className="px-4 py-3 text-left font-medium">Tarikh</th>}
                  {showName && <th className="px-4 py-3 text-left font-medium">Pekerja</th>}
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-center font-medium">Masuk</th>
                  <th className="px-4 py-3 text-center font-medium">Rehat</th>
                  <th className="px-4 py-3 text-center font-medium">Keluar</th>
                  <th className="px-4 py-3 text-left font-medium">Catatan</th>
                  {showLink && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-t border-border align-middle hover:bg-neutral-bg/50">
                    {showDate && <td className="px-4 py-3 whitespace-nowrap font-medium">{r.date}</td>}
                    {showName && (
                      <td className="px-4 py-3">
                        <Title r={r} />
                        {r.sub && <div className="truncate text-xs text-muted">{r.sub}</div>}
                      </td>
                    )}
                    <td className="px-4 py-3"><Badge tone={r.status.tone}>{r.status.label}</Badge></td>
                    <td className={`px-4 py-3 text-center tabular-nums ${r.late ? "font-semibold text-bad" : ""}`}>{r.workIn}</td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      {r.breakOut === "—" ? "—" : (
                        <>
                          <div>{r.breakOut} – {r.breakIn}</div>
                          {r.breakLength && (
                            <div className={`text-xs ${r.breakOver ? "font-semibold text-bad" : "text-muted"}`}>{r.breakLength}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-center tabular-nums ${r.earlyOut ? "font-semibold text-bad" : ""}`}>{r.workOut}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.notes.length ? r.notes.map((n) => <Badge key={n.label} tone={n.tone}>{n.label}</Badge>) : <span className="text-muted">—</span>}
                      </div>
                    </td>
                    {showLink && (
                      <td className="px-4 py-3 text-right">
                        {r.dayHref && <Link href={r.dayHref} className="font-medium text-brand hover:underline">{r.dayLabel}</Link>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {searchable && shown.length !== rows.length && (
            <p className="text-xs text-muted">Menunjukkan {shown.length} daripada {rows.length}.</p>
          )}
        </>
      )}
    </div>
  );
}

function Title({ r }: { r: ListRow }) {
  const text = r.name ?? r.date ?? "";
  return r.employeeHref ? (
    <Link href={r.employeeHref} className="block truncate font-medium text-foreground hover:text-brand">{text}</Link>
  ) : (
    <span className="block truncate font-medium">{text}</span>
  );
}

