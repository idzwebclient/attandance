import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createBranch, createDb, createUser, type Db } from "./harness";

const HQ = { lat: 3.139, lng: 101.6869 };
const FAR = { lat: 3.149, lng: 101.6869 }; // ~1.1 km away

let db: Db;
let hq: { id: string; qr_identifier: string };
let staff: { authId: string; profileId: string };
let admin: { authId: string; profileId: string };

beforeEach(async () => {
  db = await createDb();
  hq = await createBranch(db, { name: "HQ", ...HQ, radius: 100 });
  staff = await createUser(db, { name: "Aisyah", code: "S001", branchId: hq.id });
  admin = await createUser(db, { name: "Boss", code: "A001", role: "admin" });
});

type Issue = { code: string; source: string; event_type: string | null; distance_meters: string | null; employee_id: string };

const submit = (authId: string, lat: number, lng: number, qr: string | null, intent = "WORK_IN") =>
  asUser<{ r: { ok: boolean; code?: string } }>(
    db, authId, "select public.submit_attendance($1, $2, 10, $3, $4::public.attendance_event_type) as r", [lat, lng, qr, intent],
  ).then((rows) => rows[0].r);

const issues = () => db.query<Issue>("select * from public.punch_issues order by occurred_at").then((r) => r.rows);

describe("punch issues log", () => {
  it("records a refused punch with the distance from the branch", async () => {
    const r = await submit(staff.authId, FAR.lat, FAR.lng, hq.qr_identifier);
    expect(r.code).toBe("OUTSIDE_RADIUS");
    const [row] = await issues();
    expect(row).toMatchObject({ code: "OUTSIDE_RADIUS", source: "server", event_type: "WORK_IN", employee_id: staff.profileId });
    expect(Number(row.distance_meters)).toBeGreaterThan(1000);
  });

  it("records a wrong QR but not the normal 'please scan' step", async () => {
    expect((await submit(staff.authId, HQ.lat, HQ.lng, null)).code).toBe("QR_REQUIRED");
    expect(await issues()).toHaveLength(0);
    expect((await submit(staff.authId, HQ.lat, HQ.lng, "nope")).code).toBe("INVALID_QR");
    expect((await issues()).map((i) => i.code)).toEqual(["INVALID_QR"]);
  });

  it("does not log successful punches", async () => {
    expect((await submit(staff.authId, HQ.lat, HQ.lng, hq.qr_identifier)).ok).toBe(true);
    expect(await issues()).toHaveLength(0);
  });

  it("skips the same problem repeated within a minute", async () => {
    await submit(staff.authId, FAR.lat, FAR.lng, hq.qr_identifier);
    await submit(staff.authId, FAR.lat, FAR.lng, hq.qr_identifier);
    expect(await issues()).toHaveLength(1);
  });

  it("accepts known device problems from the app and ignores unknown codes", async () => {
    await asUser(db, staff.authId, "select public.report_punch_issue('CAMERA_DENIED', 'ditolak', 'WORK_IN')");
    await asUser(db, staff.authId, "select public.report_punch_issue('HACK', 'x')");
    const rows = await issues();
    expect(rows.map((i) => [i.code, i.source])).toEqual([["CAMERA_DENIED", "device"]]);
  });

  it("is readable by admin only, and nobody writes directly", async () => {
    await submit(staff.authId, FAR.lat, FAR.lng, hq.qr_identifier);
    expect(await asUser(db, staff.authId, "select * from public.punch_issues")).toHaveLength(0);
    expect(await asUser(db, admin.authId, "select * from public.punch_issues")).toHaveLength(1);
    await expect(
      asUser(db, staff.authId, "insert into public.punch_issues (employee_id, source, code) values ($1, 'device', 'X')", [staff.profileId]),
    ).rejects.toThrow();
  });
});
