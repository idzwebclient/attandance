import { Field, inputClass } from "@/components/ui";
import type { Profile } from "@/lib/types";

export function EmployeeFields({
  branches,
  profile,
  defaultRole = "staff",
}: {
  branches: { id: string; name: string }[];
  profile?: Profile;
  defaultRole?: Profile["role"];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nama penuh">
        <input name="full_name" defaultValue={profile?.full_name} required className={inputClass} />
      </Field>
      <Field label="No. pekerja">
        <input name="employee_code" defaultValue={profile?.employee_code} required className={inputClass} />
      </Field>
      <Field label="Peranan">
        <select name="role" defaultValue={profile?.role ?? defaultRole} className={inputClass}>
          <option value="staff">Staf</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <Field label="Cawangan" hint="Wajib untuk staf dan manager.">
        <select name="branch_id" defaultValue={profile?.branch_id ?? ""} className={inputClass}>
          <option value="">Tiada</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Punch manager" hint="Untuk manager sahaja. Staf sentiasa perlu imbas QR.">
        <select name="qr_exempt" defaultValue={String(profile?.qr_exempt ?? false)} className={inputClass}>
          <option value="false">Mesti imbas QR di cawangan</option>
          <option value="true">Boleh punch di mana-mana tanpa QR</option>
        </select>
      </Field>
    </div>
  );
}
