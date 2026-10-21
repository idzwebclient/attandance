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
});
