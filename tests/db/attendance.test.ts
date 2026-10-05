import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createBranch, createDb, createUser, punch, type Db } from "./harness";

// Branch in Kuala Lumpur. Times below are UTC; Malaysia is UTC+8, so 01:00Z = 09:00 MYT.
const HQ = { lat: 3.139, lng: 101.6869 };
const NEAR = { lat: 3.1393, lng: 101.6869 }; // ~33 m away
const FAR = { lat: 3.149, lng: 101.6869 }; // ~1.1 km away

let db: Db;
let hq: { id: string; qr_identifier: string };
let other: { id: string; qr_identifier: string };
let staff: { authId: string; profileId: string };

beforeEach(async () => {
  db = await createDb();
  hq = await createBranch(db, { name: "HQ", ...HQ, radius: 100 });
  other = await createBranch(db, { name: "Penang", lat: 5.4141, lng: 100.3288 });
  staff = await createUser(db, { name: "Aisyah", code: "S001", branchId: hq.id });
});

const at = (time: string, date = "2026-10-05") => `${date}T${time}Z`;

async function fullDay(times: [string, string, string, string]) {
  const [win, bout, bin, wout] = times;
  const results = [
    await punch(db, staff.authId, { at: at(win), ...NEAR, qr: hq.qr_identifier }),
    await punch(db, staff.authId, { at: at(bout), ...NEAR, qr: hq.qr_identifier, intent: "BREAK_OUT" }),
    await punch(db, staff.authId, { at: at(bin), ...NEAR, qr: hq.qr_identifier }),
    await punch(db, staff.authId, { at: at(wout), ...NEAR, qr: hq.qr_identifier }),
  ];
  return results;
}

describe("calculations", () => {
  it("records an on-time, in-policy, complete day", async () => {
    const r = await fullDay(["01:00:45", "04:00:00", "05:00:00", "10:00:00"]);
    expect(r.map((x) => x.event_type)).toEqual(["WORK_IN", "BREAK_OUT", "BREAK_IN", "WORK_OUT"]);
    const day = r[3].day;
    expect(day).toMatchObject({
      attendance_date: "2026-10-05",
      arrival_status: "ON_TIME",
      late_minutes: 0,
      early_arrival_minutes: 0,
      break_duration_minutes: 60,
      break_status: "WITHIN_LIMIT",
      excess_break_minutes: 0,
      departure_status: "COMPLETE",
      early_departure_minutes: 0,
      completion_status: "COMPLETED",
    });
  });

  it("flags late arrival, excess break and early departure", async () => {
    const r = await fullDay(["01:07:30", "04:00:00", "05:15:20", "09:30:00"]);
    expect(r[3].day).toMatchObject({
      arrival_status: "LATE",
      late_minutes: 7,
      break_duration_minutes: 75,
      break_status: "BREAK_EXCEEDED",
      excess_break_minutes: 15,
      departure_status: "EARLY_DEPARTURE",
      early_departure_minutes: 30,
    });
  });

  it("flags early arrival", async () => {
    const r = await punch(db, staff.authId, { at: at("00:42:00"), ...NEAR, qr: hq.qr_identifier });
    expect(r.day).toMatchObject({ arrival_status: "EARLY", early_arrival_minutes: 18, completion_status: "WORKING" });
  });

  it("groups days by Malaysia time, not UTC", async () => {
    // 23:30 MYT on 5 Oct, then 00:30 MYT on 6 Oct.
    const a = await punch(db, staff.authId, { at: at("15:30:00"), ...NEAR, qr: hq.qr_identifier });
    const b = await punch(db, staff.authId, { at: at("16:30:00"), ...NEAR, qr: hq.qr_identifier });
    expect(a.day.attendance_date).toBe("2026-10-05");
    expect(b.event_type).toBe("WORK_IN");
    expect(b.day.attendance_date).toBe("2026-10-06");
  });
});

describe("sequence", () => {
  it("asks which action when both break and clock-out are valid", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    const r = await punch(db, staff.authId, { at: at("04:00:00"), ...NEAR, qr: hq.qr_identifier });
    expect(r).toMatchObject({ ok: false, code: "INTENT_REQUIRED", next_events: ["BREAK_OUT", "WORK_OUT"] });
  });

  it("allows clocking out without a break", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    const r = await punch(db, staff.authId, { at: at("10:00:00"), ...NEAR, qr: hq.qr_identifier, intent: "WORK_OUT" });
    expect(r.ok).toBe(true);
    expect(r.day).toMatchObject({ break_status: "NO_BREAK", completion_status: "COMPLETED", break_duration_minutes: null });
  });

  it("rejects duplicates, out-of-order events and punches after completion", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    expect((await punch(db, staff.authId, { at: at("01:01:00"), ...NEAR, qr: hq.qr_identifier, intent: "WORK_IN" })).code)
      .toBe("DUPLICATE_EVENT");
    expect((await punch(db, staff.authId, { at: at("01:01:00"), ...NEAR, qr: hq.qr_identifier, intent: "BREAK_IN" })).code)
      .toBe("INVALID_SEQUENCE");
    await punch(db, staff.authId, { at: at("10:00:00"), ...NEAR, qr: hq.qr_identifier, intent: "WORK_OUT" });
    expect((await punch(db, staff.authId, { at: at("10:05:00"), ...NEAR, qr: hq.qr_identifier })).code)
      .toBe("DAY_COMPLETED");
    const { rows } = await db.query("select count(*)::int as n from attendance_events");
    expect(rows[0]).toEqual({ n: 2 });
  });

  it("cannot clock out while on break", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    await punch(db, staff.authId, { at: at("04:00:00"), ...NEAR, qr: hq.qr_identifier, intent: "BREAK_OUT" });
    const r = await punch(db, staff.authId, { at: at("10:00:00"), ...NEAR, qr: hq.qr_identifier, intent: "WORK_OUT" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_SEQUENCE", next_events: ["BREAK_IN"] });
  });
});

describe("location and QR", () => {
  it("rejects work-in outside the radius without creating anything", async () => {
    const r = await punch(db, staff.authId, { at: at("01:00:00"), ...FAR, qr: hq.qr_identifier });
    expect(r.code).toBe("OUTSIDE_RADIUS");
    const { rows } = await db.query("select (select count(*) from attendance_days)::int d, (select count(*) from attendance_events)::int e");
    expect(rows[0]).toEqual({ d: 0, e: 0 });
  });

  it("requires a valid QR for this branch", async () => {
    const base = { at: at("01:00:00"), ...NEAR };
    expect((await punch(db, staff.authId, base)).code).toBe("QR_REQUIRED");
    expect((await punch(db, staff.authId, { ...base, qr: "nonsense" })).code).toBe("INVALID_QR");
    expect((await punch(db, staff.authId, { ...base, qr: other.qr_identifier })).code).toBe("QR_WRONG_BRANCH");
  });

  it("rejects missing or inaccurate location", async () => {
    const base = { at: at("01:00:00"), qr: hq.qr_identifier };
    expect((await punch(db, staff.authId, { ...base, lat: null as never, lng: null as never })).code)
      .toBe("LOCATION_UNAVAILABLE");
    expect((await punch(db, staff.authId, { ...base, ...NEAR, accuracy: 500 })).code).toBe("LOCATION_INACCURATE");
  });

  it("records a remote break outside the radius without QR", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    const out = await punch(db, staff.authId, { at: at("04:00:00"), ...FAR, intent: "BREAK_OUT" });
    expect(out).toMatchObject({ ok: true, event_type: "BREAK_OUT", is_remote_break: true });
    // A QR sent from outside is ignored rather than trusted.
    const back = await punch(db, staff.authId, { at: at("04:50:00"), ...FAR, qr: hq.qr_identifier });
    expect(back.is_remote_break).toBe(true);
    const { rows } = await db.query(
      "select event_type, verification_mode, is_remote_break, qr_identifier_reference from attendance_events order by recorded_at",
    );
    expect(rows.slice(1)).toEqual([
      { event_type: "BREAK_OUT", verification_mode: "REMOTE_LOCATION_ONLY", is_remote_break: true, qr_identifier_reference: null },
      { event_type: "BREAK_IN", verification_mode: "REMOTE_LOCATION_ONLY", is_remote_break: true, qr_identifier_reference: null },
    ]);
  });

  it("requires QR for a break taken inside the radius", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    const r = await punch(db, staff.authId, { at: at("04:00:00"), ...NEAR, intent: "BREAK_OUT" });
    expect(r.code).toBe("QR_REQUIRED");
  });
});

describe("accounts", () => {
  it("blocks inactive users and admins from punching", async () => {
    const inactive = await createUser(db, { name: "Old", code: "S002", branchId: hq.id, active: false });
    const admin = await createUser(db, { name: "Admin", code: "A001", role: "admin", branchId: hq.id });
    const p = { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier };
    expect((await punch(db, inactive.authId, p)).code).toBe("USER_INACTIVE");
    expect((await punch(db, admin.authId, p)).code).toBe("ROLE_NOT_PERMITTED");
  });

  it("lets managers punch their own attendance", async () => {
    const mgr = await createUser(db, { name: "Mgr", code: "M001", role: "manager", branchId: hq.id });
    expect((await punch(db, mgr.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier })).ok).toBe(true);
  });
});

describe("integrity and access", () => {
  it("keeps raw events immutable", async () => {
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    await expect(db.query("update attendance_events set recorded_at = now()")).rejects.toThrow(/immutable/);
    await expect(db.query("delete from attendance_events")).rejects.toThrow(/immutable/);
  });

  it("scopes reads to self, managed branch, or admin", async () => {
    const colleague = await createUser(db, { name: "Badrul", code: "S003", branchId: hq.id });
    const remote = await createUser(db, { name: "Chong", code: "S004", branchId: other.id });
    const mgr = await createUser(db, { name: "Mgr", code: "M001", role: "manager", branchId: hq.id });
    const admin = await createUser(db, { name: "Admin", code: "A001", role: "admin" });
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    await punch(db, colleague.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    await punch(db, remote.authId, { at: at("01:00:00"), lat: 5.4141, lng: 100.3288, qr: other.qr_identifier });

    const names = async (authId: string) =>
      (await asUser<{ full_name: string }>(db, authId, "select full_name from attendance_day_report order by full_name"))
        .map((r) => r.full_name);
    expect(await names(staff.authId)).toEqual(["Aisyah"]);
    expect(await names(mgr.authId)).toEqual(["Aisyah", "Badrul"]);
    expect(await names(admin.authId)).toEqual(["Aisyah", "Badrul", "Chong"]);

    const events = await asUser<{ n: number }>(db, staff.authId, "select count(*)::int n from attendance_events");
    expect(events[0].n).toBe(1);
    const branches = await asUser<{ name: string }>(db, mgr.authId, "select name from branches");
    expect(branches.map((b) => b.name)).toEqual(["HQ"]);
  });

  it("stops API users writing attendance or calling internal functions", async () => {
    await expect(asUser(db, staff.authId,
      "insert into attendance_days (employee_id, branch_id, attendance_date) values ($1, $2, '2026-10-05')",
      [staff.profileId, hq.id])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, staff.authId,
      "select app.submit_attendance_at($1, now(), 3.139, 101.6869, 5, $2, null, null)",
      [staff.authId, hq.qr_identifier])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, staff.authId, "update profiles set role = 'admin'")).resolves.toEqual([]);
    const { rows } = await db.query<{ role: string }>("select role from profiles where id = $1", [staff.profileId]);
    expect(rows[0].role).toBe("staff");
  });

  it("lets the public RPC record with the server clock", async () => {
    const r = await asUser<{ r: { ok: boolean; event_type: string } }>(db, staff.authId,
      "select public.submit_attendance(3.1393, 101.6869, 5, $1) as r", [hq.qr_identifier]);
    expect(r[0].r).toMatchObject({ ok: true, event_type: "WORK_IN" });
  });
});

describe("admin corrections and reporting", () => {
  it("lets an admin fix a forgotten clock-out, with an audit row", async () => {
    const admin = await createUser(db, { name: "Admin", code: "A001", role: "admin" });
    await punch(db, staff.authId, { at: at("01:10:00"), ...NEAR, qr: hq.qr_identifier });

    const denied = await asUser<{ r: { code: string } }>(db, staff.authId,
      "select public.admin_correct_attendance($1, '2026-10-05', $2, null, null, $3, 'x') as r",
      [staff.profileId, at("01:00:00"), at("10:00:00")]);
    expect(denied[0].r.code).toBe("FORBIDDEN");

    const ok = await asUser<{ r: { ok: boolean; day: Record<string, unknown> } }>(db, admin.authId,
      "select public.admin_correct_attendance($1, '2026-10-05', $2, null, null, $3, 'Lupa punch out') as r",
      [staff.profileId, at("01:10:00"), at("10:00:00")]);
    expect(ok[0].r.ok).toBe(true);
    expect(ok[0].r.day).toMatchObject({ completion_status: "COMPLETED", late_minutes: 10, break_status: "NO_BREAK" });

    const { rows } = await db.query<{ reason: string; before_values: { work_out_at: null } }>(
      "select reason, before_values from attendance_corrections");
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("Lupa punch out");
    expect(rows[0].before_values.work_out_at).toBeNull();
  });

  it("shows unfinished past days as INCOMPLETE", async () => {
    await punch(db, staff.authId, { at: at("01:00:00", "2020-01-06"), ...NEAR, qr: hq.qr_identifier });
    const { rows } = await db.query<{ completion_status: string; effective_status: string }>(
      "select completion_status, effective_status from attendance_day_report");
    expect(rows[0]).toEqual({ completion_status: "WORKING", effective_status: "INCOMPLETE" });
  });

  it("rejects an invalid timezone in settings", async () => {
    await expect(db.query("update system_settings set timezone = 'Mars/Base'")).rejects.toThrow();
  });
});

describe("attendance context", () => {
  it("tells the app what comes next and when QR is needed", async () => {
    const ctx = async (time: string, loc?: { lat: number; lng: number }) =>
      (await db.query<{ r: Record<string, unknown> }>(
        "select app.attendance_context_at($1, $2, $3, $4) as r",
        [staff.authId, at(time), loc?.lat ?? null, loc?.lng ?? null])).rows[0].r;

    expect(await ctx("00:30:00")).toMatchObject({
      ok: true, today: "2026-10-05", completion_status: "NOT_STARTED", next_events: ["WORK_IN"], qr_required: null,
      branch: { name: "HQ" },
    });
    await punch(db, staff.authId, { at: at("01:00:00"), ...NEAR, qr: hq.qr_identifier });
    expect(await ctx("04:00:00", FAR)).toMatchObject({
      completion_status: "WORKING", within_radius: false, qr_required: { BREAK_OUT: false, WORK_OUT: true },
    });
    expect(await ctx("04:00:00", NEAR)).toMatchObject({ within_radius: true, qr_required: { BREAK_OUT: true, WORK_OUT: true } });
  });
});

describe("monthly summary", () => {
  it("aggregates a month and counts absences on work days only", async () => {
    // Created before September so every work day counts.
    await db.query("update profiles set created_at = '2026-08-01'");
    await db.query("insert into public_holidays values ('2026-09-16', 'Hari Malaysia')");
    // Tue 1 Sep: late 10 min, 75 min break, left 30 min early.
    await punch(db, staff.authId, { at: at("01:10:00", "2026-09-01"), ...NEAR, qr: hq.qr_identifier });
    await punch(db, staff.authId, { at: at("04:00:00", "2026-09-01"), ...NEAR, qr: hq.qr_identifier, intent: "BREAK_OUT" });
    await punch(db, staff.authId, { at: at("05:15:00", "2026-09-01"), ...NEAR, qr: hq.qr_identifier });
    await punch(db, staff.authId, { at: at("09:30:00", "2026-09-01"), ...NEAR, qr: hq.qr_identifier });
    // Wed 2 Sep: early, never clocked out.
    await punch(db, staff.authId, { at: at("00:50:00", "2026-09-02"), ...NEAR, qr: hq.qr_identifier });

    const { rows } = await db.query<Record<string, unknown>>(
      "select * from monthly_summary('2026-09-01') where employee_code = 'S001'");
    // September 2026 has 22 weekdays; minus Hari Malaysia = 21; minus 2 attended = 19.
    expect(rows[0]).toMatchObject({
      recorded_days: 2, early_arrivals: 1, late_arrivals: 1, total_late_minutes: 10,
      excess_breaks: 1, total_excess_break_minutes: 15, early_departures: 1,
      total_early_departure_minutes: 30, completed_days: 1, incomplete_days: 1, absent_days: 19,
      branch_name: "HQ",
    });
  });

  it("respects RLS for managers", async () => {
    const mgr = await createUser(db, { name: "Mgr", code: "M001", role: "manager", branchId: other.id });
    const rows = await asUser<{ employee_code: string }>(db, mgr.authId, "select employee_code from monthly_summary('2026-09-01')");
    expect(rows.map((r) => r.employee_code)).toEqual(["M001"]);
  });
});

describe("range summary", () => {
  it("summarises any date range", async () => {
    await db.query("update profiles set created_at = '2026-08-01'");
    await punch(db, staff.authId, { at: at("01:10:00", "2026-09-01"), ...NEAR, qr: hq.qr_identifier });
    await punch(db, staff.authId, { at: at("01:20:00", "2026-09-03"), ...NEAR, qr: hq.qr_identifier });
    const one = await db.query<Record<string, unknown>>(
      "select * from attendance_summary('2026-09-01', '2026-09-02') where employee_code = 'S001'");
    expect(one.rows[0]).toMatchObject({ recorded_days: 1, late_arrivals: 1, total_late_minutes: 10, absent_days: 1 });
    const both = await db.query<Record<string, unknown>>(
      "select * from attendance_summary('2026-09-01', '2026-09-04') where employee_code = 'S001'");
    // Tue 1 - Fri 4 Sep: 4 work days, 2 attended.
    expect(both.rows[0]).toMatchObject({ recorded_days: 2, late_arrivals: 2, total_late_minutes: 30, absent_days: 2 });
  });
});
