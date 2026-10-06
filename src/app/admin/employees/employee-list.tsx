import Link from "next/link";
import { ActionForm } from "@/components/form-state";
import { ListSearch } from "@/components/list-search";
import { Badge, Card, Empty, Field, PageTitle, Table, inputClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBranchNames } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Role } from "@/lib/types";
import { createEmployee } from "../actions";
import { EmployeeFields } from "./employee-fields";

const ROLE_LABEL: Record<Role, string> = { staff: "Staf", manager: "Manager", admin: "Admin" };

export async function EmployeeList({ roles, title, defaultRole }: { roles: Role[]; title: string; defaultRole: Role }) {
  const { supabase } = await requireRole("admin");
  const [{ data: profiles }, branchNames, users] = await Promise.all([
    supabase.from("profiles").select("*").in("role", roles).order("is_active", { ascending: false }).order("full_name"),
    getBranchNames(supabase),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email]));
  const branches = [...branchNames].map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-4">
      <PageTitle title={title} subtitle={`${profiles?.length ?? 0} orang`} />
      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-medium">+ Cipta akaun baharu</summary>
        <div className="mt-4">
          <ActionForm action={createEmployee} submitLabel="Cipta akaun">
            <EmployeeFields branches={branches} defaultRole={defaultRole} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emel (untuk log masuk)">
                <input name="email" type="email" required className={inputClass} />
              </Field>
              <Field label="Kata laluan sementara" hint="Minimum 8 aksara. Pekerja boleh tukar di halaman Akaun.">
                <input name="password" type="text" minLength={8} required className={inputClass} autoComplete="off" />
              </Field>
            </div>
          </ActionForm>
        </div>
      </details>
      {profiles?.length ? (
        <>
        {profiles.length > 5 && <ListSearch scope="employee-list" />}
        <Card className="!p-0" id="employee-list">
          <Table>
            <thead>
              <tr><th>Nama</th><th>No. pekerja</th><th>Emel</th><th>Peranan</th><th>Cawangan</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {(profiles as Profile[]).map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "opacity-60"}
                  data-search={`${p.full_name} ${p.employee_code} ${emails.get(p.auth_user_id) ?? ""} ${(p.branch_id && branchNames.get(p.branch_id)) || ""}`}>
                  <td className="font-medium whitespace-nowrap">{p.full_name}</td>
                  <td>{p.employee_code}</td>
                  <td className="break-all">{emails.get(p.auth_user_id) ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {ROLE_LABEL[p.role]}
                    {p.role === "manager" && p.qr_exempt && <> <Badge tone="info">Tanpa QR</Badge></>}
                  </td>
                  <td className="whitespace-nowrap">{(p.branch_id && branchNames.get(p.branch_id)) || "—"}</td>
                  <td>{p.is_active ? <Badge tone="good">Aktif</Badge> : <Badge tone="bad">Tidak aktif</Badge>}</td>
                  <td><Link href={`/admin/employees/${p.id}`} className="text-brand hover:underline">Urus</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        </>
      ) : (
        <Empty>Belum ada akaun.</Empty>
      )}
    </div>
  );
}
