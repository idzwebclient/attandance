import type { countBoard } from "@/lib/data";
import { Card } from "./ui";

export function BoardStats({ counts, past }: { counts: ReturnType<typeof countBoard>; past?: boolean }) {
  const items = [
    { label: "Pekerja", value: counts.total },
    { label: past ? "Tidak hadir" : "Belum masuk", value: counts.notIn, bad: past },
    { label: "Cuti", value: counts.onLeave },
    { label: "Lewat", value: counts.late, bad: true },
    { label: "Sedang bekerja", value: counts.working },
    { label: "Sedang rehat", value: counts.onBreak },
    { label: "Rehat lebih", value: counts.exceeded, bad: true },
    { label: "Balik awal", value: counts.earlyOut, bad: true },
    { label: "Selesai", value: counts.completed },
    ...(past ? [{ label: "Tidak lengkap", value: counts.incomplete, bad: true }] : []),
  ];
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-9">
      {items.map((i) => (
        <Card key={i.label} className={`!p-2 sm:!p-3 ${i.bad && i.value > 0 ? "!border-bad/30 !bg-bad-bg" : ""}`}>
          <div className="truncate text-[10px] leading-tight text-muted sm:text-xs">{i.label}</div>
          <div className={`text-lg font-bold tabular-nums sm:text-2xl ${i.bad && i.value > 0 ? "text-bad" : ""}`}>{i.value}</div>
        </Card>
      ))}
    </div>
  );
}
