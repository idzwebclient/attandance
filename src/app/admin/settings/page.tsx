import type { Metadata } from "next";
import { ActionForm } from "@/components/form-state";
import { Button, Card, Empty, Field, PageTitle, Table, inputClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { formatDate, todayIn } from "@/lib/format";
import { addHoliday, deleteHoliday, recomputeDays, updateSettings } from "../actions";

export const metadata: Metadata = { title: "Tetapan" };

const DAYS = [
  [1, "Isnin"], [2, "Selasa"], [3, "Rabu"], [4, "Khamis"], [5, "Jumaat"], [6, "Sabtu"], [7, "Ahad"],
] as const;

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const s = await getSettings(supabase);
  const today = todayIn(s.timezone);
  const { data: holidays } = await supabase
    .from("public_holidays").select("*").gte("holiday_date", `${today.slice(0, 4)}-01-01`).order("holiday_date");

  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle title="Tetapan" />
      <Card>
        <h2 className="mb-3 font-medium">Polisi kehadiran</h2>
        <ActionForm action={updateSettings} submitLabel="Simpan tetapan">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Masa mula kerja">
              <input type="time" name="work_start_time" defaultValue={s.work_start_time.slice(0, 5)} required className={inputClass} />
            </Field>
            <Field label="Masa tamat kerja">
              <input type="time" name="work_end_time" defaultValue={s.work_end_time.slice(0, 5)} required className={inputClass} />
            </Field>
            <Field label="Had rehat (minit)">
              <input type="number" name="break_max_minutes" min={1} defaultValue={s.break_max_minutes} required className={inputClass} />
            </Field>
            <Field label="Radius lalai (meter)" hint="Untuk cawangan baharu.">
              <input type="number" name="default_radius_meters" min={10} defaultValue={s.default_radius_meters} required className={inputClass} />
            </Field>
            <Field label="Had ketepatan GPS (meter)" hint="Bacaan GPS yang lebih kasar ditolak.">
              <input type="number" name="max_location_accuracy_meters" min={5} defaultValue={s.max_location_accuracy_meters} required className={inputClass} />
            </Field>
            <Field label="Zon masa">
              <input name="timezone" defaultValue={s.timezone} required className={inputClass} />
            </Field>
          </div>
          <Field
            label="Kitaran bulan bermula pada hari ke-"
            hint="Contoh 25: setiap bulan dikira dari 25 hari bulan hingga 24 bulan berikutnya. Pilih 1 untuk bulan kalendar biasa."
          >
            <select name="cycle_start_day" defaultValue={s.cycle_start_day} className={inputClass}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d === 1 ? "1 (bulan kalendar)" : `${d} hingga ${d - 1} bulan berikutnya`}</option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Hari bekerja (untuk kiraan tidak hadir)</legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map(([n, label]) => (
                <label key={n} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="work_days" value={n} defaultChecked={s.work_days.includes(n)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-1 font-medium">Kira semula rekod lama</h2>
        <p className="mb-3 text-sm text-muted">
          Perubahan polisi hanya dikenakan pada punch baharu. Gunakan ini untuk mengira semula status hari-hari lepas
          dengan polisi semasa.
        </p>
        <ActionForm action={recomputeDays} submitLabel="Kira semula" className="flex flex-wrap items-end gap-3">
          <Field label="Dari"><input type="date" name="from" required className={inputClass} /></Field>
          <Field label="Hingga"><input type="date" name="to" defaultValue={today} required className={inputClass} /></Field>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="mb-3 font-medium">Cuti umum</h2>
        <ActionForm action={addHoliday} submitLabel="Tambah cuti" className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Tarikh"><input type="date" name="holiday_date" required className={inputClass} /></Field>
          <Field label="Nama"><input name="name" required className={inputClass} placeholder="Hari Malaysia" /></Field>
        </ActionForm>
        {holidays?.length ? (
          <Table>
            <thead><tr><th>Tarikh</th><th>Nama</th><th /></tr></thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.holiday_date}>
                  <td className="whitespace-nowrap">{formatDate(h.holiday_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
                  <td>{h.name}</td>
                  <td className="text-right">
                    <form action={deleteHoliday}>
                      <input type="hidden" name="holiday_date" value={h.holiday_date} />
                      <Button variant="secondary" type="submit" className="!px-2 !py-1 text-xs">Padam</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>Tiada cuti umum untuk tahun ini.</Empty>
        )}
      </Card>
    </div>
  );
}
