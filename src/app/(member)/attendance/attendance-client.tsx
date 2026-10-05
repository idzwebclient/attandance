"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { QrScannerView } from "@/components/qr-scanner";
import { Badge, Button, Card, Notice } from "@/components/ui";
import {
  ARRIVAL_LABEL,
  ARRIVAL_TONE,
  BREAK_LABEL,
  BREAK_TONE,
  COMPLETION_LABEL,
  COMPLETION_TONE,
  DEPARTURE_LABEL,
  DEPARTURE_TONE,
  EVENT_LABEL,
  formatDate,
  formatTime,
  minutes,
} from "@/lib/format";
import { getCurrentPosition, LocationError, type Position } from "@/lib/geolocation";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceContext, AttendanceDay, EventType, SubmitResult } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "scan"; event: EventType; position: Position }
  | { kind: "done"; result: Extract<SubmitResult, { ok: true }> }
  | { kind: "error"; message: string };

const STEPS: { event: EventType; field: keyof AttendanceDay }[] = [
  { event: "WORK_IN", field: "work_in_at" },
  { event: "BREAK_OUT", field: "break_out_at" },
  { event: "BREAK_IN", field: "break_in_at" },
  { event: "WORK_OUT", field: "work_out_at" },
];

function networkMessage() {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "Tiada sambungan internet. Kehadiran tidak direkodkan."
    : "Pelayan tidak dapat dihubungi. Kehadiran tidak direkodkan. Cuba lagi.";
}

export function AttendanceClient({ initial, scannedQr }: { initial: AttendanceContext; scannedQr: string | null }) {
  const router = useRouter();
  const [ctx, setCtx] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // A QR opened through the phone camera link is used once, for the next action.
  const [pendingQr, setPendingQr] = useState<string | null>(scannedQr);

  const refresh = useCallback(async () => {
    const { data } = await createClient().rpc("get_attendance_context");
    if (data) setCtx(data);
    router.refresh();
  }, [router]);

  const submit = useCallback(
    async (event: EventType, position: Position, qr: string | null) => {
      setPhase({ kind: "busy", label: "Merekod kehadiran…" });
      const { data, error } = await createClient().rpc("submit_attendance", {
        p_latitude: position.latitude,
        p_longitude: position.longitude,
        p_accuracy_meters: position.accuracy,
        p_qr_identifier: qr,
        p_intent: event,
        p_client_time: new Date().toISOString(),
      });
      if (error || !data) {
        setPhase({ kind: "error", message: networkMessage() });
        return;
      }
      const result = data as SubmitResult;
      if (result.ok) {
        setPendingQr(null);
        setPhase({ kind: "done", result });
        await refresh();
      } else if (result.code === "QR_REQUIRED") {
        // Location changed since the check (now inside the branch): scan and retry.
        setPhase({ kind: "scan", event, position });
      } else {
        setPhase({ kind: "error", message: result.message });
        if (result.code === "INVALID_QR" || result.code === "QR_WRONG_BRANCH") setPendingQr(null);
        if (["DUPLICATE_EVENT", "INVALID_SEQUENCE", "DAY_COMPLETED"].includes(result.code)) await refresh();
      }
    },
    [refresh],
  );

  const start = useCallback(
    async (event: EventType) => {
      setPhase({ kind: "busy", label: "Mendapatkan lokasi…" });
      let position: Position;
      try {
        position = await getCurrentPosition();
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof LocationError ? e.message : "Lokasi tidak dapat diperoleh." });
        return;
      }

      setPhase({ kind: "busy", label: "Menyemak lokasi…" });
      const { data, error } = await createClient().rpc("get_attendance_context", {
        p_latitude: position.latitude,
        p_longitude: position.longitude,
      });
      if (error || !data) {
        setPhase({ kind: "error", message: networkMessage() });
        return;
      }
      const check = data as AttendanceContext;
      if (!check.ok) {
        setPhase({ kind: "error", message: check.message });
        return;
      }
      setCtx(check);
      const isWork = event === "WORK_IN" || event === "WORK_OUT";
      if (isWork && check.within_radius === false) {
        setPhase({
          kind: "error",
          message: `Anda berada ${Math.round(check.distance_meters ?? 0)} m dari cawangan, di luar kawasan yang dibenarkan.`,
        });
        return;
      }
      const needsQr = check.qr_required?.[event] ?? true;
      if (!needsQr) {
        await submit(event, position, null);
      } else if (pendingQr) {
        await submit(event, position, pendingQr);
      } else {
        setPhase({ kind: "scan", event, position });
      }
    },
    [pendingQr, submit],
  );

  if (!ctx.ok) {
    return <Notice tone="bad">{ctx.message}</Notice>;
  }

  const day = ctx.day;
  const status = ctx.completion_status;
  const busy = phase.kind === "busy";

  return (
    <div className="mx-auto max-w-md space-y-4">
      {phase.kind === "scan" && (
        <QrScannerView
          onCancel={() => setPhase({ kind: "idle" })}
          onResult={(id) => submit(phase.event, phase.position, id)}
        />
      )}

      <div>
        <p className="text-sm text-muted">{formatDate(ctx.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        <h1 className="text-xl font-semibold">Hai, {ctx.profile.full_name.split(" ")[0]}</h1>
        <p className="text-sm text-muted">{ctx.branch?.name ?? "Tiada cawangan"}</p>
      </div>

      <Card className="space-y-4 text-center">
        <Badge tone={COMPLETION_TONE[status]}>{COMPLETION_LABEL[status]}</Badge>

        {phase.kind === "done" ? (
          <div className="space-y-1 py-2">
            <div className="text-4xl">✓</div>
            <p className="text-lg font-semibold">{EVENT_LABEL[phase.result.event_type]} direkodkan</p>
            <p className="text-3xl font-bold tabular-nums">{formatTime(phase.result.recorded_at, ctx.timezone)}</p>
            {phase.result.is_remote_break && <Badge tone="info">Rehat di luar cawangan</Badge>}
            <ResultStatus result={phase.result} />
            <Button variant="secondary" className="mt-3" onClick={() => setPhase({ kind: "idle" })}>OK</Button>
          </div>
        ) : ctx.next_events.length === 0 ? (
          <p className="py-4 text-muted">Kehadiran hari ini sudah lengkap. Jumpa esok!</p>
        ) : (
          <div className="space-y-3">
            {phase.kind === "error" && <Notice tone="bad">{phase.message}</Notice>}
            {ctx.next_events.map((event, i) => (
              <Button
                key={event}
                variant={i === 0 ? "primary" : "secondary"}
                disabled={busy}
                onClick={() => start(event)}
                className={i === 0 ? "w-full py-6 text-lg" : "w-full py-4"}
              >
                {busy && i === 0 ? phase.label : EVENT_LABEL[event]}
              </Button>
            ))}
            <p className="text-xs text-muted">
              {pendingQr ? "Kod QR cawangan sudah diimbas. " : ""}
              Lokasi anda akan disemak. Imbas kod QR cawangan apabila diminta.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-medium">Hari ini</h2>
        <ol className="space-y-2">
          {STEPS.map(({ event, field }) => (
            <li key={event} className="flex items-center justify-between text-sm">
              <span className={day?.[field] ? "" : "text-muted"}>{EVENT_LABEL[event]}</span>
              <span className="font-medium tabular-nums">{formatTime(day?.[field] as string | null, ctx.timezone)}</span>
            </li>
          ))}
        </ol>
        {day && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {day.arrival_status && (
              <Badge tone={ARRIVAL_TONE[day.arrival_status]}>
                {ARRIVAL_LABEL[day.arrival_status]}
                {day.late_minutes > 0 && ` ${minutes(day.late_minutes)}`}
              </Badge>
            )}
            {day.break_status && (
              <Badge tone={BREAK_TONE[day.break_status]}>
                Rehat: {BREAK_LABEL[day.break_status]}
                {day.break_duration_minutes != null && ` (${minutes(day.break_duration_minutes)})`}
              </Badge>
            )}
            {day.departure_status && day.work_out_at && (
              <Badge tone={DEPARTURE_TONE[day.departure_status]}>{DEPARTURE_LABEL[day.departure_status]}</Badge>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function ResultStatus({ result }: { result: Extract<SubmitResult, { ok: true }> }) {
  const d = result.day;
  switch (result.event_type) {
    case "WORK_IN":
      return d.arrival_status ? (
        <p className="text-sm text-muted">
          {ARRIVAL_LABEL[d.arrival_status]}
          {d.late_minutes > 0 && ` · lewat ${minutes(d.late_minutes)}`}
          {d.early_arrival_minutes > 0 && ` · awal ${minutes(d.early_arrival_minutes)}`}
        </p>
      ) : null;
    case "BREAK_IN":
      return (
        <p className="text-sm text-muted">
          Rehat {minutes(d.break_duration_minutes)}
          {d.excess_break_minutes > 0 && ` · lebih ${minutes(d.excess_break_minutes)}`}
        </p>
      );
    case "WORK_OUT":
      return d.departure_status ? (
        <p className="text-sm text-muted">
          {DEPARTURE_LABEL[d.departure_status]}
          {d.early_departure_minutes > 0 && ` · ${minutes(d.early_departure_minutes)} awal`}
        </p>
      ) : null;
    default:
      return null;
  }
}
