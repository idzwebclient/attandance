import type { Metadata } from "next";
import Link from "next/link";
import { ListSearch } from "@/components/list-search";
import { Badge, Card, Empty, PageTitle, Table } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Pekerja" };

export default async function ManagerEmployees() {
  const { supabase, profile, branch } = await requireRole("manager");
  const { data } = await supabase.from("profiles").select("*").eq("branch_id", profile.branch_id!)
    .in("role", ["staff", "manager"]).order("is_active", { ascending: false }).order("full_name");
  const people = (data ?? []) as Profile[];
  return (
    <div>
      <PageTitle title="Pekerja" subtitle={`${branch?.name} · ${people.length} orang`} />
      {people.length > 5 && <div className="mb-3"><ListSearch scope="branch-people" /></div>}
      {people.length ? (
        <Card className="!p-0" id="branch-people">
          <Table>
            <thead><tr><th>Nama</th><th>No. pekerja</th><th>Peranan</th><th>Status</th><th /></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "opacity-60"} data-search={`${p.full_name} ${p.employee_code}`}>
                  <td className="font-medium">{p.full_name}</td>
                  <td>{p.employee_code}</td>
                  <td>{p.role === "manager" ? "Manager" : "Staf"}</td>
                  <td>{p.is_active ? <Badge tone="good">Aktif</Badge> : <Badge tone="bad">Tidak aktif</Badge>}</td>
                  <td><Link href={`/manager/employees/${p.id}`} className="text-brand hover:underline">Sejarah</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <Empty>Tiada pekerja di cawangan ini.</Empty>
      )}
    </div>
  );
}
