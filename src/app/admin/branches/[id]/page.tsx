import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form-state";
import { Badge, Button, Card, PageTitle, buttonClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import type { Branch } from "@/lib/types";
import { regenerateQr, setBranchActive, updateBranch } from "../../actions";
import { BranchFields } from "../branch-fields";

export const metadata: Metadata = { title: "Urus cawangan" };

export default async function BranchDetail({ params }: PageProps<"/admin/branches/[id]">) {
  const { supabase } = await requireRole("admin");
  const { id } = await params;
  const { data: b } = await supabase.from("branches").select("*").eq("id", id).maybeSingle<Branch>();
  if (!b) notFound();
  const settings = await getSettings(supabase);

  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle
        title={b.name}
        subtitle={b.is_active ? <Badge tone="good">Aktif</Badge> : <Badge tone="bad">Tidak aktif</Badge>}
        actions={
          <>
            <Link href={`/admin/branches/${b.id}/qr`} className={buttonClass()}>Cetak QR</Link>
            <form action={setBranchActive}>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="active" value={String(!b.is_active)} />
              <Button variant={b.is_active ? "danger" : "secondary"} type="submit">
                {b.is_active ? "Nyahaktifkan" : "Aktifkan"}
              </Button>
            </form>
          </>
        }
      />
      <Card>
        <ActionForm action={updateBranch} submitLabel="Simpan">
          <input type="hidden" name="id" value={b.id} />
          <BranchFields branch={b} defaultRadius={settings.default_radius_meters} />
        </ActionForm>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Kod QR</h2>
        <p className="text-sm text-muted">
          Jana semula jika kod QR lama hilang atau disalin. Kod lama akan terus tidak sah, jadi cetak dan tampal kod baharu.
        </p>
        <p className="font-mono text-xs text-muted">ID semasa: {b.qr_identifier.slice(0, 8)}…</p>
        <form action={regenerateQr}>
          <input type="hidden" name="id" value={b.id} />
          <Button variant="secondary" type="submit">Jana semula kod QR</Button>
        </form>
      </Card>
    </div>
  );
}
