import { ActionForm } from "@/components/form-state";
import { Field, inputClass } from "@/components/ui";
import { correctAttendance } from "../actions";

export function CorrectionForm({
  employees,
  employeeId,
  date,
  values,
  lockEmployee,
}: {
  employees: { id: string; full_name: string; employee_code: string }[];
  employeeId?: string;
  date?: string;
  values: { work_in: string; break_out: string; break_in: string; work_out: string };
  lockEmployee?: boolean;
}) {
  return (
    <ActionForm action={correctAttendance} submitLabel="Simpan pembetulan">
      {lockEmployee ? (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="date" value={date} />
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pekerja">
            <select name="employee_id" defaultValue={employeeId} required className={inputClass}>
              <option value="">Pilih pekerja</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
            </select>
          </Field>
          <Field label="Tarikh">
            <input type="date" name="date" defaultValue={date} required className={inputClass} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Masuk kerja"><input type="time" name="work_in" defaultValue={values.work_in} className={inputClass} /></Field>
        <Field label="Mula rehat"><input type="time" name="break_out" defaultValue={values.break_out} className={inputClass} /></Field>
        <Field label="Tamat rehat"><input type="time" name="break_in" defaultValue={values.break_in} className={inputClass} /></Field>
        <Field label="Tamat kerja"><input type="time" name="work_out" defaultValue={values.work_out} className={inputClass} /></Field>
      </div>
      <Field label="Sebab pembetulan" hint="Wajib. Disimpan dalam log audit.">
        <input name="reason" required className={inputClass} placeholder="Contoh: lupa punch out, disahkan oleh manager" />
      </Field>
    </ActionForm>
  );
}
