"use client";

import { createClient } from "./supabase/client";

// Problems that stop a punch on the phone itself, before the server sees it.
// Server refusals are logged by submit_attendance in the database.
export type DeviceIssueCode =
  | "CAMERA_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "NO_CAMERA"
  | "NOT_BRANCH_QR"
  | "SCAN_CANCELLED"
  | "LOCATION_DENIED"
  | "LOCATION_TIMEOUT"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_UNSUPPORTED"
  | "OFFLINE"
  | "SERVER_UNREACHABLE"
  | "SERVER_ERROR";

type Report = {
  p_code: DeviceIssueCode;
  p_message: string | null;
  p_event_type: string | null;
  p_detail: string | null;
  p_occurred_at: string;
};

// Reports made without internet wait here and are sent on the next chance.
const KEY = "hadir:punch-issues";
const MAX_QUEUED = 20;

function readQueue(): Report[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeQueue(q: Report[]) {
  try {
    if (q.length) localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX_QUEUED)));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the report is lost, the punch flow is not affected.
  }
}

async function send(r: Report) {
  const { error } = await createClient().rpc("report_punch_issue", r);
  return !error;
}

// Fire and forget: never blocks or breaks the punch flow.
export function reportPunchIssue(
  code: DeviceIssueCode,
  opts: { message?: string | null; event?: string | null; detail?: string | null } = {},
) {
  const r: Report = {
    p_code: code,
    p_message: opts.message ?? null,
    p_event_type: opts.event ?? null,
    p_detail: opts.detail ?? null,
    p_occurred_at: new Date().toISOString(),
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    writeQueue([...readQueue(), r]);
    return;
  }
  send(r)
    .then((ok) => {
      if (!ok) writeQueue([...readQueue(), r]);
    })
    .catch(() => writeQueue([...readQueue(), r]));
}

let flushing = false;
export async function flushPunchIssues() {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const q = readQueue();
  if (!q.length) return;
  flushing = true;
  try {
    const left: Report[] = [];
    for (const r of q) {
      if (!(await send(r).catch(() => false))) left.push(r);
    }
    // Keep anything queued while we were sending.
    writeQueue([...left, ...readQueue().slice(q.length)]);
  } finally {
    flushing = false;
  }
}
