import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createBranch, createDb, createUser, type Db } from "./harness";

let db: Db;
let staff: { authId: string; profileId: string };
let manager: { authId: string; profileId: string };
let otherManager: { authId: string; profileId: string };
let admin: { authId: string; profileId: string };

beforeEach(async () => {
  db = await createDb();
  const hq = await createBranch(db, { name: "HQ", lat: 3.139, lng: 101.6869 });
  const pg = await createBranch(db, { name: "Penang", lat: 5.4141, lng: 100.3288 });
  staff = await createUser(db, { name: "Aisyah", code: "S001", branchId: hq.id });
  manager = await createUser(db, { name: "Mira", code: "M001", role: "manager", branchId: hq.id });
  otherManager = await createUser(db, { name: "Pak Ali", code: "M002", role: "manager", branchId: pg.id });
  admin = await createUser(db, { name: "Boss", code: "A001", role: "admin" });
});

type R = { ok: boolean; code?: string; id?: string };
const call = async (u: { authId: string }, sql: string, params: unknown[]) =>
  (await asUser<{ r: R }>(db, u.authId, `select ${sql} as r`, params))[0].r;
const apply = (u: { authId: string }, from: string, to: string, type = "ANNUAL") =>
  call(u, "apply_leave($1, $2, $3, 'Balik kampung')", [type, from, to]);
const decide = (u: { authId: string }, id: string, approve: boolean) =>
  call(u, "decide_leave($1, $2)", [id, approve]);

describe("leave requests", () => {
  it("lets staff apply and their branch manager approve", async () => {
    const r = await apply(staff, "2026-09-07", "2026-09-08");
    expect(r.ok).toBe(true);
    expect(await decide(otherManager, r.id!, true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await decide(staff, r.id!, true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await decide(manager, r.id!, true)).toMatchObject({ ok: true });
    const rows = await asUser<{ status: string }>(db, staff.authId, "select status from leave_requests");
    expect(rows).toEqual([{ status: "APPROVED" }]);
  });

  it("sends a manager's own leave to an admin", async () => {
    const r = await apply(manager, "2026-09-07", "2026-09-07");
    expect(await decide(manager, r.id!, true)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await decide(admin, r.id!, false)).toMatchObject({ ok: true });
  });

  it("rejects overlapping requests and admins applying", async () => {
    await apply(staff, "2026-09-07", "2026-09-09");
    expect(await apply(staff, "2026-09-09", "2026-09-10")).toMatchObject({ ok: false, code: "OVERLAP" });
    expect(await apply(admin, "2026-09-07", "2026-09-07")).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("lets the employee cancel only while pending", async () => {
    const a = await apply(staff, "2026-09-07", "2026-09-07");
    expect(await call(staff, "cancel_leave($1)", [a.id])).toMatchObject({ ok: true });
    const b = await apply(staff, "2026-09-07", "2026-09-07");
    await decide(manager, b.id!, true);
    expect(await call(staff, "cancel_leave($1)", [b.id])).toMatchObject({ ok: false, code: "NOT_PENDING" });
  });

  it("hides other branches' leave from a manager", async () => {
    await apply(staff, "2026-09-07", "2026-09-07");
    expect(await asUser(db, otherManager.authId, "select id from leave_requests")).toEqual([]);
    expect(await asUser(db, manager.authId, "select id from leave_requests")).toHaveLength(1);
  });

  it("counts approved leave as leave, not absence", async () => {
    await db.query("update profiles set created_at = '2026-08-01'");
    const r = await apply(staff, "2026-09-05", "2026-09-08"); // Sat-Tue: Mon & Tue are work days
    await decide(manager, r.id!, true);
    const { rows } = await db.query<{ absent_days: number; leave_days: number }>(
      "select absent_days, leave_days from attendance_summary('2026-09-07', '2026-09-11') where employee_code = 'S001'");
    expect(rows[0]).toEqual({ absent_days: 3, leave_days: 2 });
  });

  it("enforces the admin's yearly limit and disabled types", async () => {
    await db.query("update leave_policies set annual_days = 3 where leave_type = 'ANNUAL'");
    await db.query("delete from annual_leave_tiers");
    await db.query("update leave_policies set is_active = false where leave_type = 'UNPAID'");
    expect(await apply(staff, "2026-09-07", "2026-09-07", "UNPAID")).toMatchObject({ ok: false, code: "TYPE_DISABLED" });
    expect(await apply(staff, "2026-09-12", "2026-09-13")).toMatchObject({ ok: false, code: "NO_WORK_DAYS" });
    // Fri 4 - Mon 7 Sep: 2 work days (weekend skipped).
    expect(await apply(staff, "2026-09-04", "2026-09-07")).toMatchObject({ ok: true });
    const over = await apply(staff, "2026-09-14", "2026-09-15");
    expect(over).toMatchObject({ ok: false, code: "LIMIT" });
    expect(await apply(staff, "2026-09-14", "2026-09-14")).toMatchObject({ ok: true });
    // Sick leave has no limit.
    expect(await apply(staff, "2026-10-05", "2026-10-09", "SICK")).toMatchObject({ ok: true });
    const bal = await asUser<{ leave_type: string; limit_days: number | null; used_days: number }>(db, staff.authId,
      "select leave_type, limit_days, used_days from leave_balances(2026) where leave_type in ('ANNUAL', 'SICK') order by leave_type");
    expect(bal).toEqual([{ leave_type: "ANNUAL", limit_days: 3, used_days: 3 }, { leave_type: "SICK", limit_days: null, used_days: 5 }]);
  });

  it("gives annual leave by length of service, with a personal override", async () => {
    const ent = async () => (await db.query<{ n: number | null }>(
      "select app.leave_entitlement($1, 'ANNUAL', 2026) as n", [staff.profileId])).rows[0].n;
    expect(await ent()).toBe(null); // no hire date, no general limit
    await db.query("update profiles set hire_date = '2025-03-01' where id = $1", [staff.profileId]);
    expect(await ent()).toBe(12);
    await db.query("update profiles set hire_date = '2023-06-01' where id = $1", [staff.profileId]);
    expect(await ent()).toBe(14);
    await db.query("update profiles set hire_date = '2018-01-01' where id = $1", [staff.profileId]);
    expect(await ent()).toBe(16);
    // Service counts from the end of probation when set.
    await db.query("update profiles set probation_end_date = '2021-06-01' where id = $1", [staff.profileId]);
    expect(await ent()).toBe(14);
    await db.query("update profiles set annual_leave_days = 20 where id = $1", [staff.profileId]);
    expect(await ent()).toBe(20);
  });

  it("blocks annual leave during probation", async () => {
    await db.query("update profiles set probation_end_date = '2026-09-30' where id = $1", [staff.profileId]);
    expect(await apply(staff, "2026-09-28", "2026-09-28")).toMatchObject({ ok: false, code: "PROBATION" });
    expect(await apply(staff, "2026-09-28", "2026-09-28", "SICK")).toMatchObject({ ok: true });
    expect(await apply(staff, "2026-10-01", "2026-10-01")).toMatchObject({ ok: true });
  });

  it("prorates annual leave in the first year of service", async () => {
    const ent = async (year: number) => (await db.query<{ n: number | null }>(
      "select app.leave_entitlement($1, 'ANNUAL', $2) as n", [staff.profileId, year])).rows[0].n;
    // Probation ends 1 Jul 2026: 6 months of 12 days = 6.
    await db.query("update profiles set hire_date = '2026-04-01', probation_end_date = '2026-07-01' where id = $1", [staff.profileId]);
    expect(await ent(2026)).toBe(6);
    expect(await ent(2027)).toBe(12);
    expect(await ent(2025)).toBe(0);
    // 15 Oct: 2 completed months, 12 x 2 / 12 = 2.
    await db.query("update profiles set probation_end_date = '2026-10-15' where id = $1", [staff.profileId]);
    expect(await ent(2026)).toBe(2);
    // 1 Aug: 5 months, 12 x 5 / 12 = 5; with 14 days tier-0: 5.83 rounds to 6.
    await db.query("update profiles set probation_end_date = '2026-08-01' where id = $1", [staff.profileId]);
    expect(await ent(2026)).toBe(5);
    await db.query("update annual_leave_tiers set days = 14 where min_years = 0");
    expect(await ent(2026)).toBe(6);
  });

  it("carries up to 5 unused annual days into next year, usable before 1 March", async () => {
    // Full years of service; 12 days a year.
    await db.query("update profiles set hire_date = '2025-01-01', probation_end_date = null where id = $1", [staff.profileId]);
    const r = await apply(staff, "2025-03-03", "2025-03-07"); // 5 days used in 2025 -> 7 unused, carry 5
    await decide(manager, r.id!, true);
    const bal = async () => (await asUser<Record<string, unknown>>(db, staff.authId,
      "select limit_days, used_days, carried_days, carried_used, carry_expires::text from leave_balances(2026) where leave_type = 'ANNUAL'"))[0];
    expect(await bal()).toEqual({ limit_days: 12, used_days: 0, carried_days: 5, carried_used: 0, carry_expires: "2026-03-01" });
    // February: 17 days allowed (12 + 5 carried).
    expect(await apply(staff, "2026-02-02", "2026-02-25")).toMatchObject({ ok: false, code: "LIMIT" }); // 18 days
    expect(await apply(staff, "2026-02-02", "2026-02-13")).toMatchObject({ ok: true }); // 10 days: 5 carried + 5
    expect(await bal()).toMatchObject({ used_days: 5, carried_used: 5 });
    // From March only this year's 7 remaining days.
    expect(await apply(staff, "2026-03-02", "2026-03-11")).toMatchObject({ ok: false, code: "LIMIT" }); // 8 days
    expect(await apply(staff, "2026-03-02", "2026-03-10")).toMatchObject({ ok: true }); // 7 days
  });

  it("lets carried days lapse after 1 March", async () => {
    await db.query("update profiles set hire_date = '2025-01-01', probation_end_date = null where id = $1", [staff.profileId]);
    // Nothing used in 2025: 5 carried into 2026, but only usable before 1 March.
    expect(await apply(staff, "2026-03-02", "2026-03-18")).toMatchObject({ ok: false, code: "LIMIT" }); // 13 days
    expect(await apply(staff, "2026-03-02", "2026-03-17")).toMatchObject({ ok: true }); // 12 days
  });

  it("shows balances to managers for their branch only", async () => {
    const codes = async (u: { authId: string }) => (await asUser<{ employee_code: string }>(db, u.authId,
      "select distinct p.employee_code from leave_balances(2026) b join profiles p on p.id = b.employee_id order by 1"))
      .map((r) => r.employee_code);
    expect(await codes(manager)).toEqual(["M001", "S001"]);
    expect(await codes(otherManager)).toEqual(["M002"]);
    expect(await codes(admin)).toEqual(["M001", "M002", "S001"]);
    expect(await codes(staff)).toEqual(["S001"]);
  });
});
