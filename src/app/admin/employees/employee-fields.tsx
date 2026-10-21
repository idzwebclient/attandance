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
      <Field label="No. pekerja" hint={profile ? undefined : "Dijana automatik semasa simpan."}>
        {profile ? (
          <input name="employee_code" defaultValue={profile.employee_code} required className={inputClass} />
        ) : (
          <input value="Automatik" disabled className={`${inputClass} text-muted`} />
        )}
      </Field>
      <Field label="No. telefon">
        <input name="phone" type="tel" inputMode="tel" defaultValue={profile?.phone ?? ""} placeholder="012-345 6789" className={inputClass} />
      </Field>
      <Field label="No. IC">
        <input name="ic_number" inputMode="numeric" defaultValue={profile?.ic_number ?? ""} placeholder="900101-02-1234" className={inputClass} />
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
      <Field label="Tarikh mula kerja" hint="Tempoh perkhidmatan dikira dari tarikh tamat percubaan, atau tarikh ini jika tiada.">
        <input type="date" name="hire_date" defaultValue={profile?.hire_date ?? ""} className={inputClass} />
      </Field>
      <Field label="Tarikh tamat percubaan" hint="Tiada cuti tahunan sehingga tarikh ini. Kosongkan jika sudah disahkan.">
        <input type="date" name="probation_end_date" defaultValue={profile?.probation_end_date ?? ""} className={inputClass} />
      </Field>
      <Field label="Cuti tahunan khas (hari)" hint="Kosongkan untuk ikut tempoh perkhidmatan.">
        <input type="number" name="annual_leave_days" min={0} max={366} defaultValue={profile?.annual_leave_days ?? ""}
          className={inputClass} />
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
