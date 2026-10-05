"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QrScannerView } from "@/components/qr-scanner";
import { Icon, type IconName } from "@/components/icons";
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
import { clearPosition, getFreshPosition, LocationError, warmUpPosition, type Position } from "@/lib/geolocation";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceContext, AttendanceDay, EventType, SubmitResult } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "scan"; event: EventType; position: Promise<Position | null> }
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

  useEffect(() => {
    warmUpPosition();
  }, []);

  // Resolves to null (with the error shown) when no location can be read.
  const locate = useCallback(async (): Promise<Position | null> => {
    try {
      return await getFreshPosition();
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof LocationError ? e.message : "Lokasi tidak dapat diperoleh." });
      return null;
    }
  }, []);

  const submit = useCallback(
    async (event: EventType, positionPromise: Promise<Position | null>, qr: string | null) => {
      setPhase({ kind: "busy", label: "Mendapatkan lokasi…" });
      const position = await positionPromise;
      if (!position) return;
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
      if (result.ok || result.code !== "QR_REQUIRED") clearPosition();
      if (result.ok) {
        setPendingQr(null);
        setPhase({ kind: "done", result });
        await refresh();
      } else if (result.code === "QR_REQUIRED") {
        // Inside the branch: the server wants the QR. Scan and retry.
        setPhase({ kind: "scan", event, position: Promise.resolve(position) });
      } else {
        setPhase({ kind: "error", message: result.message });
        if (result.code === "INVALID_QR" || result.code === "QR_WRONG_BRANCH") setPendingQr(null);
        if (["DUPLICATE_EVENT", "INVALID_SEQUENCE", "DAY_COMPLETED"].includes(result.code)) await refresh();
      }
    },
    [refresh],
  );

  const start = useCallback(
    (event: EventType) => {
      // GPS and camera run at the same time; the server decides everything else.
      const position = locate();
      if (pendingQr) {
        submit(event, position, pendingQr);
      } else if (event === "WORK_IN" || event === "WORK_OUT") {
        // QR is always required to start or end work: open the camera right away.
        setPhase({ kind: "scan", event, position });
      } else {
        // Breaks need QR only inside the branch; the server answers QR_REQUIRED if so.
        submit(event, position, null);
      }
    },
    [locate, pendingQr, submit],
  );

  if (!ctx.ok) {
    return <Notice tone="bad">{ctx.message}</Notice>;
  }

  const day = ctx.day;
  const status = ctx.completion_status;
  const busy = phase.kind === "busy";
  const doneIndex = STEPS.findLastIndex(({ field }) => day?.[field]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      {phase.kind === "scan" && (
        <QrScannerView
          onCancel={() => setPhase({ kind: "idle" })}
          onResult={(id) => submit(phase.event, phase.position, id)}
        />
      )}

      <div className="rounded-2xl bg-brand p-5 text-brand-fg shadow-sm">
        <p className="text-sm opacity-90">Hai, {ctx.profile.full_name.split(" ")[0]} 👋</p>
        <LiveClock tz={ctx.timezone} />
        <p className="text-sm opacity-90">
          {formatDate(ctx.today, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs">
          <Icon name="pin" className="h-3.5 w-3.5" />
          {ctx.branch?.name ?? "Tiada cawangan"}
        </p>
      </div>

      <Card className="space-y-4 !p-5">
        {phase.kind === "done" ? (
          <div className="space-y-2 py-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-good-bg text-good">
              <Icon name="check" className="h-9 w-9" />
            </div>
            <p className="text-lg font-semibold">{EVENT_LABEL[phase.result.event_type]} berjaya</p>
            <p className="text-4xl font-bold tabular-nums">{formatTime(phase.result.recorded_at, ctx.timezone)}</p>
            {phase.result.is_remote_break && <Badge tone="info">Rehat di luar cawangan</Badge>}
            <ResultStatus result={phase.result} />
            <Button variant="secondary" className="mt-2 w-full py-3" onClick={() => setPhase({ kind: "idle" })}>
              OK
            </Button>
          </div>
        ) : ctx.next_events.length === 0 ? (
          <div className="space-y-2 py-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-good-bg text-good">
              <Icon name="check" className="h-9 w-9" />
            </div>
            <p className="text-lg font-semibold">Kerja hari ini selesai</p>
            <p className="text-sm text-muted">Terima kasih! Jumpa esok.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-center">
              <Badge tone={COMPLETION_TONE[status]}>{COMPLETION_LABEL[status]}</Badge>
            </div>
            {phase.kind === "error" && (
              <div className="flex gap-2 rounded-xl bg-bad-bg p-3 text-sm text-bad">
                <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{phase.message}</span>
              </div>
            )}
            {ctx.next_events.map((event, i) => (
              <button
                key={event}
                type="button"
                disabled={busy}
                onClick={() => start(event)}
                className={`flex w-full items-center justify-center gap-3 rounded-2xl font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                  i === 0 ? "bg-brand py-6 text-xl text-brand-fg shadow-md" : "border-2 border-border bg-white py-4 text-base"
                }`}
              >
                {busy && i === 0 ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {phase.label}
                  </>
                ) : (
                  <>
                    <Icon name={EVENT_ICON[event]} className={i === 0 ? "h-7 w-7" : "h-5 w-5"} />
                    {EVENT_LABEL[event]}
                  </>
                )}
              </button>
            ))}
            <p className="text-center text-xs text-muted">
              {pendingQr
                ? "Kod QR sudah diimbas. Tekan butang di atas."
                : "Tekan butang, kemudian imbas kod QR di kedai jika diminta."}
            </p>
          </div>
        )}
      </Card>

      <Card className="!p-5">
        <h2 className="mb-4 font-semibold">Hari ini</h2>
        <ol className="relative space-y-4">
          {STEPS.map(({ event, field }, i) => {
            const at = day?.[field] as string | null | undefined;
            const skipped = !at && i < doneIndex;
            return (
              <li key={event} className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    at ? "bg-brand text-brand-fg" : "bg-neutral-bg text-muted"
                  }`}
                >
                  <Icon name={at ? "check" : EVENT_ICON[event]} className="h-4 w-4" />
                </span>
                <span className={`flex-1 ${at ? "font-medium" : "text-muted"}`}>{EVENT_LABEL[event]}</span>
                <span className="font-semibold tabular-nums">
                  {at ? formatTime(at, ctx.timezone) : skipped ? <span className="text-xs font-normal text-muted">Tiada</span> : "—"}
                </span>
              </li>
            );
          })}
        </ol>
        {day && (day.arrival_status || day.break_status || (day.departure_status && day.work_out_at)) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
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

const EVENT_ICON: Record<EventType, IconName> = {
  WORK_IN: "login",
  BREAK_OUT: "coffee",
  BREAK_IN: "back",
  WORK_OUT: "logout",
};

function LiveClock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return (
    <p className="my-1 text-5xl font-bold tracking-tight tabular-nums">
      {now ? formatTime(now.toISOString(), tz) : "--:--"}
    </p>
  );
}

function ResultStatus({ result }: { result: Extract<SubmitResult, { ok: true }> }) {
  const d = result.day;
  switch (result.event_type) {
    case "WORK_IN":
      return d.arrival_status ? (
        <p className="text-sm text-muted">
          {ARRIVAL_LABEL[d.arrival_status]}
          {d.late_minutes > 0 && ` ${minutes(d.late_minutes)}`}
          {d.early_arrival_minutes > 0 && ` ${minutes(d.early_arrival_minutes)}`}
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
