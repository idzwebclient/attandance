import type { Metadata } from "next";
import Link from "next/link";
import { BoardStats } from "@/components/board-stats";
import { Card, PageTitle, Table } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { buildDayBoard, countBoard, getActiveEmployees, getBranchNames, getDayReports, getSettings } from "@/lib/data";
import { formatDate, todayIn } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard admin" };

export default async function AdminDashboard() {
  const { supabase } = await requireRole("admin");
  const settings = await getSettings(supabase);
  const today = todayIn(settings.timezone);
  const [employees, reports, branchNames] = await Promise.all([
    getActiveEmployees(supabase),
    getDayReports(supabase, { from: today, to: today }),
    getBranchNames(supabase),
  ]);
  const board = buildDayBoard(employees, reports, today, branchNames);
  const perBranch = [...branchNames].map(([id, name]) => ({
    id,
    name,
    counts: countBoard(board.filter((r) => r.branch_id === id)),
  }));

  return (
    <div>
      <PageTitle title="Hari ini" subtitle={`Semua cawangan · ${formatDate(today, { dateStyle: "full" })}`} />
      <BoardStats counts={countBoard(board)} />
      <Card className="!p-0">
        <Table>
          <thead>
            <tr>
              <th>Cawangan</th><th>Pekerja</th><th>Belum masuk</th><th>Lewat</th><th>Sedang rehat</th>
              <th>Rehat lebih</th><th>Selesai</th><th />
            </tr>
          </thead>
          <tbody>
            {perBranch.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td>{b.counts.total}</td>
                <td>{b.counts.notIn}</td>
                <td className={b.counts.late ? "text-bad font-medium" : ""}>{b.counts.late}</td>
                <td>{b.counts.onBreak}</td>
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
