import Link from "next/link";
import { Fragment } from "react";
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

// "none" selects people without a branch (usually admins).
export async function EmployeeList({
  roles,
  title,
  defaultRole,
  basePath,
  branch,
}: {
  roles: Role[];
  title: string;
  defaultRole: Role;
  basePath: string;
  branch?: string;
}) {
  const { supabase } = await requireRole("admin");
  const [{ data: profiles }, branchNames, users] = await Promise.all([
    supabase.from("profiles").select("*").in("role", roles).order("is_active", { ascending: false }).order("full_name"),
    getBranchNames(supabase),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email]));
  const branches = [...branchNames].map(([id, name]) => ({ id, name }));
  const all = (profiles ?? []) as Profile[];
  const count = (id: string | null) => all.filter((p) => p.branch_id === id).length;
  const shown = branch ? all.filter((p) => (branch === "none" ? !p.branch_id : p.branch_id === branch)) : all;
  // Group by branch (A–Z), people without a branch last.
  const groups = [...branches, { id: null as string | null, name: "Tiada cawangan" }]
    .map((b) => ({
      ...b,
      // The branch's manager heads its group.
      people: shown.filter((p) => p.branch_id === b.id)
        .sort((x, y) => Number(y.role === "manager") - Number(x.role === "manager")),
    }))
    .filter((g) => g.people.length);
  const chips = [
    { key: "", label: "Semua", n: all.length },
    ...branches.map((b) => ({ key: b.id, label: b.name, n: count(b.id) })).filter((c) => c.n),
    ...(count(null) ? [{ key: "none", label: "Tiada cawangan", n: count(null) }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageTitle title={title} subtitle={`${all.length} orang`} />
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
      {chips.length > 2 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {chips.map((c) => {
            const active = (branch ?? "") === c.key;
            return (
              <Link key={c.key || "all"} href={c.key ? `${basePath}?branch=${c.key}` : basePath}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:bg-neutral-bg"}`}>
                {c.label} <span className={active ? "opacity-80" : "text-muted"}>{c.n}</span>
              </Link>
            );
          })}
        </div>
      )}
      {shown.length ? (
        <>
        {shown.length > 5 && <ListSearch scope="employee-list" />}
        <Card className="!p-0" id="employee-list">
          <Table>
            <thead>
              <tr><th>Nama</th><th>No. pekerja</th><th>No. telefon</th><th>Emel</th><th>Peranan</th><th>Cawangan</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.id ?? "none"}>
                  {groups.length > 1 && (
                    <tr className="bg-neutral-bg/60">
                      <td colSpan={8} className="!py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {g.name} · {g.people.length}
                      </td>
                    </tr>
                  )}
                  {g.people.map((p) => (
                    <tr key={p.id} className={p.is_active ? "" : "opacity-60"}
                      data-search={`${p.full_name} ${p.employee_code} ${p.phone ?? ""} ${p.ic_number ?? ""} ${emails.get(p.auth_user_id) ?? ""} ${(p.branch_id && branchNames.get(p.branch_id)) || ""}`}>
                      <td className="font-medium whitespace-nowrap">{p.full_name}</td>
                      <td>{p.employee_code}</td>
                      <td className="whitespace-nowrap">{p.phone ?? "—"}</td>
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
                </Fragment>
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
