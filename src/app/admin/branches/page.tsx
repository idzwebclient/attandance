import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, PageTitle, Table, buttonClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import type { Branch } from "@/lib/types";

export const metadata: Metadata = { title: "Cawangan" };

export default async function BranchesPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: branches }, { data: staff }] = await Promise.all([
    supabase.from("branches").select("*").order("name"),
    supabase.from("profiles").select("branch_id").eq("is_active", true),
  ]);
  const headcount = new Map<string, number>();
  for (const s of staff ?? []) if (s.branch_id) headcount.set(s.branch_id, (headcount.get(s.branch_id) ?? 0) + 1);

  return (
    <div>
      <PageTitle title="Cawangan" actions={<Link href="/admin/branches/new" className={buttonClass()}>+ Cawangan baharu</Link>} />
      {branches?.length ? (
        <Card className="!p-0">
          <Table>
            <thead><tr><th>Nama</th><th>Koordinat</th><th>Radius</th><th>Pekerja</th><th>Status</th><th /></tr></thead>
            <tbody>
              {(branches as Branch[]).map((b) => (
                <tr key={b.id} className={b.is_active ? "" : "opacity-60"}>
                  <td className="font-medium">{b.name}</td>
                  <td className="font-mono text-xs">{b.latitude.toFixed(5)}, {b.longitude.toFixed(5)}</td>
                  <td>{b.allowed_radius_meters} m</td>
                  <td>{headcount.get(b.id) ?? 0}</td>
                  <td>{b.is_active ? <Badge tone="good">Aktif</Badge> : <Badge tone="bad">Tidak aktif</Badge>}</td>
                  <td className="whitespace-nowrap space-x-3">
                    <Link href={`/admin/branches/${b.id}`} className="text-brand hover:underline">Urus</Link>
                    <Link href={`/admin/branches/${b.id}/qr`} className="text-brand hover:underline">Cetak QR</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Empty>Belum ada cawangan.</Empty>
      )}
    </div>
  );
}
