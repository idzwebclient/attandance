import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(__dirname, "../../supabase/migrations");

// Minimal stand-in for the parts of Supabase the migrations rely on.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  set timezone = 'UTC';
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function createUser(
  db: Db,
  opts: { name: string; code: string; role?: "staff" | "manager" | "admin"; branchId?: string | null; active?: boolean },
) {
  const { rows: users } = await db.query<{ id: string }>("insert into auth.users default values returning id");
  const authId = users[0].id;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.profiles (auth_user_id, full_name, employee_code, role, branch_id, is_active)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [authId, opts.name, opts.code, opts.role ?? "staff", opts.branchId ?? null, opts.active ?? true],
  );
  return { authId, profileId: rows[0].id };
}

export async function createBranch(
  db: Db,
  opts: { name: string; lat: number; lng: number; radius?: number },
) {
  const { rows } = await db.query<{ id: string; qr_identifier: string }>(
    `insert into public.branches (name, latitude, longitude, allowed_radius_meters)
     values ($1, $2, $3, $4) returning id, qr_identifier`,
    [opts.name, opts.lat, opts.lng, opts.radius ?? 100],
  );
  return rows[0];
}

export type Punch = {
  at: string; // ISO timestamp, the server "now"
  lat: number;
  lng: number;
  accuracy?: number | null;
  qr?: string | null;
  intent?: "WORK_IN" | "BREAK_OUT" | "BREAK_IN" | "WORK_OUT" | "EXTRA_IN" | "EXTRA_OUT" | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Result = { ok: boolean; code?: string; [k: string]: any };

export async function punch(db: Db, authId: string, p: Punch): Promise<Result> {
  const { rows } = await db.query<{ r: Result }>(
    `select app.submit_attendance_at($1, $2, $3, $4, $5, $6, $7, null) as r`,
    [authId, p.at, p.lat, p.lng, p.accuracy ?? 10, p.qr ?? null, p.intent ?? null],
  );
  return rows[0].r;
}

// Run a query as an authenticated API user, so RLS applies.
export async function asUser<T>(db: Db, authId: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${authId}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}
