import type { ReactNode } from "react";
import { AutoSubmitForm } from "./auto-submit-form";
import { inputClass } from "./ui";

// GET form that applies as soon as a field changes, so filters live in the URL
// and there is no separate Filter button. Fields stack two per row on phones.
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <AutoSubmitForm className="no-print mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      {children}
    </AutoSubmitForm>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function MonthInput({ value, name = "month" }: { value: string; name?: string }) {
  return <input type="month" name={name} defaultValue={value} className={inputClass} required />;
}

export function DateInput({ value, name = "date" }: { value: string; name?: string }) {
  return <input type="date" name={name} defaultValue={value} className={inputClass} required />;
}

export function SelectInput({
  name,
  value,
  options,
  allLabel,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <select name={name} defaultValue={value} className={inputClass}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
