import Link from "next/link";
import { formatMonth } from "@/lib/format";

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// ‹ Oktober 2026 › — big tap targets instead of a month input and a Filter button.
export function MonthSwitcher({ month, current, href }: { month: string; current: string; href: (m: string) => string }) {
  const next = shift(month, 1);
  const btn = "flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white";
  return (
    <div className="no-print flex items-center justify-between gap-2 rounded-2xl border border-border bg-white p-2 shadow-sm">
      <Link href={href(shift(month, -1))} className={btn} aria-label="Bulan sebelum">
        <span className="text-xl leading-none">‹</span>
      </Link>
      <div className="text-center">
        <div className="font-semibold">{formatMonth(month)}</div>
        {month !== current && (
          <Link href={href(current)} className="text-xs text-brand">Kembali ke bulan ini</Link>
        )}
      </div>
      {next <= current ? (
        <Link href={href(next)} className={btn} aria-label="Bulan seterusnya">
          <span className="text-xl leading-none">›</span>
        </Link>
      ) : (
        <span className={`${btn} opacity-30`} aria-hidden="true"><span className="text-xl leading-none">›</span></span>
      )}
    </div>
  );
}
