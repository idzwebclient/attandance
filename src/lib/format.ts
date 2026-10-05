import type {
  ArrivalStatus,
  BreakStatus,
  CompletionStatus,
  DepartureStatus,
  EventType,
} from "./types";

export const DEFAULT_TZ = "Asia/Kuala_Lumpur";

export const EVENT_LABEL: Record<EventType, string> = {
  WORK_IN: "Masuk kerja",
  BREAK_OUT: "Mula rehat",
  BREAK_IN: "Tamat rehat",
  WORK_OUT: "Tamat kerja",
};

export const ARRIVAL_LABEL: Record<ArrivalStatus, string> = {
  EARLY: "Awal",
  ON_TIME: "Tepat masa",
  LATE: "Lewat",
};

export const BREAK_LABEL: Record<BreakStatus, string> = {
  WITHIN_LIMIT: "Dalam had",
  BREAK_EXCEEDED: "Lebih masa",
  INCOMPLETE: "Belum tamat",
  NO_BREAK: "Tiada rehat",
};

export const DEPARTURE_LABEL: Record<DepartureStatus, string> = {
  EARLY_DEPARTURE: "Balik awal",
  COMPLETE: "Lengkap",
  NOT_PUNCHED_OUT: "Belum punch out",
};

export const COMPLETION_LABEL: Record<CompletionStatus, string> = {
  NOT_STARTED: "Belum masuk",
  WORKING: "Sedang bekerja",
  ON_BREAK: "Sedang rehat",
  RETURNED_FROM_BREAK: "Kembali dari rehat",
  COMPLETED: "Selesai",
  INCOMPLETE: "Tidak lengkap",
};

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export const COMPLETION_TONE: Record<CompletionStatus, Tone> = {
  NOT_STARTED: "neutral",
  WORKING: "info",
  ON_BREAK: "warn",
  RETURNED_FROM_BREAK: "info",
  COMPLETED: "good",
  INCOMPLETE: "bad",
};

export const ARRIVAL_TONE: Record<ArrivalStatus, Tone> = { EARLY: "good", ON_TIME: "good", LATE: "bad" };
export const BREAK_TONE: Record<BreakStatus, Tone> = {
  WITHIN_LIMIT: "good",
  BREAK_EXCEEDED: "bad",
  INCOMPLETE: "warn",
  NO_BREAK: "neutral",
};
export const DEPARTURE_TONE: Record<DepartureStatus, Tone> = {
  EARLY_DEPARTURE: "bad",
  COMPLETE: "good",
  NOT_PUNCHED_OUT: "warn",
};

export function formatTime(iso: string | null | undefined, tz = DEFAULT_TZ) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ms-MY", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(iso));
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  // Dates are plain YYYY-MM-DD; format at UTC noon so no timezone shifts the day.
  return new Intl.DateTimeFormat("ms-MY", { ...opts, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function formatMonth(month: string) {
  return formatDate(`${month}-01`, { month: "long", year: "numeric" });
}

export function todayIn(tz = DEFAULT_TZ) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export function minutes(n: number | null | undefined) {
  if (n == null) return "—";
  if (n === 0) return "0";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}j ${m}m` : `${m}m`;
}

export function isMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function isDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// The QR printed at a branch encodes a link to the app, so the phone camera also works.
export function qrPayload(origin: string, identifier: string) {
  return `${origin}/attendance?qr=${encodeURIComponent(identifier)}`;
}

export function parseQrPayload(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.searchParams.get("qr");
  } catch {
    return /^[A-Za-z0-9_-]{8,128}$/.test(raw) ? raw : null;
  }
}

// UTC offset ("+08:00") of a timezone at noon on a given date.
export function tzOffset(date: string, tz = DEFAULT_TZ) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+00:00";
}

// "HH:MM" of an ISO timestamp in a timezone, for <input type="time">.
export function timeInputValue(iso: string | null, tz = DEFAULT_TZ) {
  return iso ? formatTime(iso, tz) : "";
}
