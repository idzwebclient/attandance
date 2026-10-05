import type { Metadata } from "next";
import { Button, Card, PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Akaun" };

const ROLE = { staff: "Staf", manager: "Manager", admin: "Admin" } as const;

export default async function AccountPage() {
  const { profile, email, branch } = await requireRole();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle title="Akaun" />
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Nama</dt><dd>{profile.full_name}</dd>
          <dt className="text-muted">No. pekerja</dt><dd>{profile.employee_code}</dd>
          <dt className="text-muted">Emel</dt><dd className="break-all">{email ?? "—"}</dd>
          <dt className="text-muted">Peranan</dt><dd>{ROLE[profile.role]}</dd>
          <dt className="text-muted">Cawangan</dt><dd>{branch?.name ?? "—"}</dd>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Tukar kata laluan</h2>
        <PasswordForm />
      </Card>
      <form action={signOut}>
        <Button variant="danger" type="submit" className="w-full">Log keluar</Button>
      </form>
    </div>
  );
}
