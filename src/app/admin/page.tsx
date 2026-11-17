import type { Metadata } from "next";
import Link from "next/link";
import { BoardStats } from "@/components/board-stats";
import { Icon } from "@/components/icons";
import { Card, PageTitle, Table } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { buildDayBoard, countBoard, getActiveEmployees, getBranchNames, getDayReports, getOnLeave, getSettings } from "@/lib/data";
import { formatDate, todayIn, tzOffset } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard admin" };

export default async function AdminDashboard() {
  const { supabase } = await requireRole("admin");
  const settings = await getSettings(supabase);
  const today = todayIn(settings.timezone);
  const [employees, reports, branchNames, onLeave, { data: issues }] = await Promise.all([
    getActiveEmployees(supabase),
    getDayReports(supabase, { from: today, to: today }),
    getBranchNames(supabase),
    getOnLeave(supabase, today),
    supabase.from("punch_issues").select("employee_id").gte("occurred_at", `${today}T00:00:00${tzOffset(today, settings.timezone)}`),
  ]);
  const issueCount = issues?.length ?? 0;
  const issuePeople = new Set((issues ?? []).map((i) => i.employee_id)).size;
  const board = buildDayBoard(employees, reports, today, branchNames, onLeave);
  const perBranch = [...branchNames].map(([id, name]) => ({
    id,
    name,
    counts: countBoard(board.filter((r) => r.branch_id === id)),
  }));

  return (
    <div>
      <PageTitle title="Hari ini" subtitle={`Semua cawangan · ${formatDate(today, { dateStyle: "full" })}`} />
      <BoardStats counts={countBoard(board)} />
      {issueCount > 0 && (
        <Link
          href={`/admin/punch-issues?from=${today}&to=${today}`}
          className="mb-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-bg p-4 text-sm text-warn hover:opacity-90"
        >
          <Icon name="alert" className="h-5 w-5 shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">{issueCount} punch gagal hari ini</span> ({issuePeople} pekerja). Lihat sebab dan cara selesai.
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
      <Card className="!p-0">
        <Table>
          <thead>
            <tr>
              <th>Cawangan</th><th>Pekerja</th><th>Belum masuk</th><th>Cuti</th><th>Sedang bekerja</th>
              <th>Sedang rehat</th><th>Lewat</th><th>Rehat lebih</th><th>Selesai</th><th />
            </tr>
          </thead>
          <tbody>
            {perBranch.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td>{b.counts.total}</td>
                <td>{b.counts.notIn}</td>
                <td>{b.counts.onLeave}</td>
                <td>{b.counts.working}</td>
                <td>{b.counts.onBreak}</td>
                <td className={b.counts.late ? "text-bad font-medium" : ""}>{b.counts.late}</td>
                <td className={b.counts.exceeded ? "text-bad font-medium" : ""}>{b.counts.exceeded}</td>
                <td>{b.counts.completed}</td>
                <td><Link className="text-brand hover:underline" href={`/admin/attendance?branch=${b.id}&date=${today}`}>Lihat</Link></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {perBranch.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Belum ada cawangan. <Link href="/admin/branches/new" className="text-brand hover:underline">Cipta cawangan pertama</Link>.
        </p>
      )}
    </div>
  );
}
