import type { ReactNode } from "react";
import { buttonClass, inputClass } from "./ui";

// Plain GET form, so filters live in the URL and pages stay server-rendered.
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <form className="no-print mb-4 flex flex-wrap items-end gap-3" method="get">
      {children}
      <button type="submit" className={buttonClass("secondary")}>Tapis</button>
    </form>
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
