"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "./ui";

// Date range (and optional branch) that applies as soon as a value changes.
export function RangeFilter({
  basePath,
  from,
  to,
  today,
  branches,
  branchId,
}: {
  basePath: string;
  from: string;
  to: string;
  today: string;
  branches?: { value: string; label: string }[];
  branchId?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    // Keep the range explicit so changing one end never resets the other.
    next.set("from", from);
    next.set("to", to);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${basePath}?${next}`);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Dari</span>
        <input type="date" value={from} max={today} className={inputClass}
          onChange={(e) => e.target.value && apply({ from: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Hingga</span>
        <input type="date" value={to} max={today} className={inputClass}
          onChange={(e) => e.target.value && apply({ to: e.target.value })} />
      </label>
      {branches && (
        <label className="col-span-2 block space-y-1 sm:min-w-56">
          <span className="text-xs font-medium text-muted">Cawangan</span>
          <select value={branchId ?? ""} className={inputClass} onChange={(e) => apply({ branch: e.target.value })}>
            <option value="">Semua cawangan</option>
            {branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
