import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveEmployees } from "@/lib/data";
import { addDays, formatDate, todayIn } from "@/lib/format";
import { grantFieldWork, revokeFieldWork } from "@/lib/field-work-actions";
import type { Settings } from "@/lib/types";
import { ActionForm } from "./form-state";
import { Badge, Button, Card, Empty, Field, PageTitle, inputClass } from "./ui";

type Permit = { id: string; work_date: string; note: string | null; employee_id: string };

// Approve field work ("Kerja luar") by date. Managers see their branch only (RLS).
export async function FieldWorkView({
  supabase,
  settings,
  branchId,
}: {
  supabase: SupabaseClient;
  settings: Settings;
  branchId?: string | null;
}) {
  const today = todayIn(settings.timezone);
  const [employees, { data }] = await Promise.all([
    getActiveEmployees(supabase, branchId),
    supabase.from("field_work_permits").select("id, work_date, note, employee_id")
      .gte("work_date", addDays(today, -14)).order("work_date").limit(500),
  ]);
  const names = new Map(employees.map((e) => [e.id, `${e.full_name} (${e.employee_code})`]));
  const permits = ((data ?? []) as Permit[]).filter((p) => names.has(p.employee_id));
  const upcoming = permits.filter((p) => p.work_date >= today);
  const recent = permits.filter((p) => p.work_date < today).reverse();

  const row = (p: Permit, canCancel: boolean) => (
    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{names.get(p.employee_id)}</div>
        <div className="text-xs text-muted">
          {formatDate(p.work_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          {p.note && ` · ${p.note}`}
        </div>
      </div>
      {p.work_date === today && <Badge tone="info">Hari ini</Badge>}
      {canCancel && (
        <form action={revokeFieldWork}>
          <input type="hidden" name="id" value={p.id} />
          <Button variant="secondary" type="submit" className="!min-h-9 !px-3 !py-1 text-xs">Batal</Button>
        </form>
      )}
    </li>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle
        title="Kerja luar"
        subtitle="Pekerja yang dibenarkan punch tanpa QR di luar kedai pada tarikh tertentu. Lokasi GPS tetap direkod."
      />
      <Card>
        <ActionForm action={grantFieldWork} submitLabel="Benarkan kerja luar">
          <Field label="Pekerja">
            <select name="employee_id" required className={inputClass} defaultValue="">
              <option value="" disabled>Pilih pekerja</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dari"><input type="date" name="from" defaultValue={today} min={today} required className={inputClass} /></Field>
            <Field label="Hingga"><input type="date" name="to" defaultValue={today} min={today} className={inputClass} /></Field>
          </div>
          <Field label="Catatan (pilihan)">
            <input name="note" placeholder="Contoh: hantar barang ke pelanggan di Sungai Petani" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>

      <section className="space-y-2">
        <h2 className="font-medium">Akan datang</h2>
        {upcoming.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {upcoming.map((p) => row(p, true))}
          </ul>
        ) : (
          <Empty>Tiada kerja luar dijadualkan.</Empty>
        )}
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-muted">14 hari lepas</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface opacity-80">
            {recent.map((p) => row(p, false))}
          </ul>
        </section>
      )}
    </div>
  );
}
