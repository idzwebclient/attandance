// End-to-end check against the real Supabase project: creates a temporary
// branch and staff account, punches through the public RPC, checks RLS, then
// removes everything it created. Usage: node --env-file=.env.local scripts/smoke-test.mjs
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const check = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`ok - ${msg}`); };

const HQ = { lat: 3.139, lng: 101.6869 };
const email = `smoke-${Date.now()}@example.com`;
const password = randomBytes(12).toString("hex");
let userId, branchId, profileId;

try {
  const { data: b } = await admin.from("branches").insert({ name: "SMOKE TEST", latitude: HQ.lat, longitude: HQ.lng, allowed_radius_meters: 100 }).select().single();
  branchId = b.id;
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue) throw ue;
  userId = u.user.id;
  const { data: p } = await admin.from("profiles").insert({ auth_user_id: userId, full_name: "Smoke Test", employee_code: `SMOKE-${Date.now()}`, role: "staff", branch_id: branchId }).select().single();
  profileId = p.id;

  const staff = anonClient();
  const { error: le } = await staff.auth.signInWithPassword({ email, password });
  check(!le, "staff can sign in");

  const { data: signup } = await anonClient().auth.signUp({ email: `x${Date.now()}@example.com`, password: "abcdefgh123" });
  check(!signup?.user, "public sign-up is disabled");

  const ctx = (await staff.rpc("get_attendance_context")).data;
  check(ctx.ok && ctx.next_events[0] === "WORK_IN", "context says WORK_IN next");

  const far = (await staff.rpc("submit_attendance", { p_latitude: 3.149, p_longitude: 101.6869, p_accuracy_meters: 10, p_qr_identifier: b.qr_identifier })).data;
  check(far.code === "OUTSIDE_RADIUS", "work-in outside radius is rejected");

  const noQr = (await staff.rpc("submit_attendance", { p_latitude: 3.1393, p_longitude: 101.6869, p_accuracy_meters: 10 })).data;
  check(noQr.code === "QR_REQUIRED", "work-in without QR is rejected");

  const ok = (await staff.rpc("submit_attendance", { p_latitude: 3.1393, p_longitude: 101.6869, p_accuracy_meters: 10, p_qr_identifier: b.qr_identifier })).data;
  check(ok.ok && ok.event_type === "WORK_IN", `work-in recorded at server time ${ok.recorded_at}`);

  const remote = (await staff.rpc("submit_attendance", { p_latitude: 3.149, p_longitude: 101.6869, p_accuracy_meters: 10, p_intent: "BREAK_OUT" })).data;
  check(remote.ok && remote.is_remote_break, "remote break without QR is recorded");

  const ins = await staff.from("attendance_days").insert({ employee_id: profileId, branch_id: branchId, attendance_date: "2020-01-01" });
  check(!!ins.error, "staff cannot write attendance rows directly");

  const internal = await staff.schema("app").rpc("submit_attendance_at", {});
  check(!!internal.error, "internal functions are not exposed");

  const esc = await staff.from("profiles").update({ role: "admin" }).eq("id", profileId).select();
  check((esc.data ?? []).length === 0, "staff cannot promote themselves");

  const mine = await staff.from("attendance_day_report").select("*");
  check(mine.data?.length === 1 && mine.data[0].arrival_status, "staff sees own day with computed status");

  const month = new Date().toISOString().slice(0, 7);
  const summary = await staff.rpc("monthly_summary", { p_month: `${month}-01` });
  check(!summary.error && summary.data.length === 1, "monthly summary works");
} finally {
  // Raw events are immutable by design, so remove the test rows with triggers
  // disabled through the Management API (needs SUPABASE_ACCESS_TOKEN).
  if (profileId) {
    const ref = new URL(url).hostname.split(".")[0];
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `begin; set local session_replication_role = replica;
          delete from public.attendance_events where employee_id = '${profileId}';
          delete from public.attendance_corrections where attendance_day_id in (select id from public.attendance_days where employee_id = '${profileId}');
          delete from public.attendance_days where employee_id = '${profileId}';
          delete from public.profiles where id = '${profileId}';
          commit;`,
      }),
    });
    if (!res.ok) console.log("cleanup note:", res.status, await res.text());
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (branchId) await admin.from("branches").delete().eq("id", branchId);
  console.log("cleaned up");
}
