-- Attendance system: initial schema, RLS and server-side attendance logic.
--
-- All attendance writes go through security-definer functions. Clients never
-- insert or update attendance rows directly, never choose timestamps, and never
-- decide whether a break is local or remote.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('staff', 'manager', 'admin');
create type public.attendance_event_type as enum ('WORK_IN', 'BREAK_OUT', 'BREAK_IN', 'WORK_OUT');
create type public.arrival_status as enum ('EARLY', 'ON_TIME', 'LATE');
-- NO_BREAK: staff clocked out without taking a break (agreed extension to the spec).
create type public.break_status as enum ('WITHIN_LIMIT', 'BREAK_EXCEEDED', 'INCOMPLETE', 'NO_BREAK');
create type public.departure_status as enum ('EARLY_DEPARTURE', 'COMPLETE', 'NOT_PUNCHED_OUT');
create type public.completion_status as enum (
  'NOT_STARTED', 'WORKING', 'ON_BREAK', 'RETURNED_FROM_BREAK', 'COMPLETED', 'INCOMPLETE'
);
create type public.verification_mode as enum ('QR_AND_LOCATION', 'REMOTE_LOCATION_ONLY');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.system_settings (
  id smallint primary key default 1 check (id = 1),
  work_start_time time not null default '09:00',
  work_end_time time not null default '18:00',
  break_max_minutes integer not null default 60 check (break_max_minutes > 0),
  default_radius_meters integer not null default 100 check (default_radius_meters > 0),
  max_location_accuracy_meters integer not null default 100 check (max_location_accuracy_meters > 0),
  timezone text not null default 'Asia/Kuala_Lumpur',
  -- ISO day of week, 1 = Monday ... 7 = Sunday. Used for absence reporting.
  work_days smallint[] not null default '{1,2,3,4,5}',
  updated_at timestamptz not null default now(),
  check (work_start_time < work_end_time)
);

insert into public.system_settings (id) values (1);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  allowed_radius_meters integer not null check (allowed_radius_meters > 0),
  qr_identifier text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  employee_code text not null unique,
  role public.app_role not null default 'staff',
  branch_id uuid references public.branches (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_branch_idx on public.profiles (branch_id);

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id),
  branch_id uuid not null references public.branches (id),
  attendance_date date not null,
  work_in_at timestamptz,
  break_out_at timestamptz,
  break_in_at timestamptz,
  work_out_at timestamptz,
  arrival_status public.arrival_status,
  early_arrival_minutes integer not null default 0,
  late_minutes integer not null default 0,
  break_status public.break_status,
  break_duration_minutes integer,
  excess_break_minutes integer not null default 0,
  departure_status public.departure_status,
  early_departure_minutes integer not null default 0,
  completion_status public.completion_status not null default 'NOT_STARTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date),
  check (break_out_at is null or (work_in_at is not null and break_out_at >= work_in_at)),
  check (break_in_at is null or (break_out_at is not null and break_in_at >= break_out_at)),
  check (work_out_at is null or work_in_at is not null),
  check (work_out_at is null or work_out_at >= coalesce(break_in_at, work_in_at)),
  check (work_out_at is null or break_out_at is null or break_in_at is not null)
);

create index attendance_days_branch_date_idx on public.attendance_days (branch_id, attendance_date);
create index attendance_days_date_idx on public.attendance_days (attendance_date);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null references public.attendance_days (id),
  employee_id uuid not null references public.profiles (id),
  branch_id uuid not null references public.branches (id),
  event_type public.attendance_event_type not null,
  recorded_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  location_accuracy_meters double precision,
  distance_from_branch_meters double precision not null,
  qr_identifier_reference text,
  verification_mode public.verification_mode not null,
  is_remote_break boolean not null default false,
  -- Device clock, diagnostic only. Never used for calculations.
  client_reported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (attendance_day_id, event_type)
);

create index attendance_events_employee_idx on public.attendance_events (employee_id, recorded_at);
create index attendance_events_branch_idx on public.attendance_events (branch_id, recorded_at);

-- Admin corrections to an attendance day. Raw events are never changed; the
-- day summary is corrected and the before/after values are kept here.
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null references public.attendance_days (id),
  corrected_by uuid not null references public.profiles (id),
  reason text not null check (length(trim(reason)) > 0),
  before_values jsonb not null,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);

create index attendance_corrections_day_idx on public.attendance_corrections (attendance_day_id);

create table public.public_holidays (
  holiday_date date primary key,
  name text not null
);

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------

create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger branches_touch before update on public.branches
  for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();
create trigger attendance_days_touch before update on public.attendance_days
  for each row execute function app.touch_updated_at();
create trigger system_settings_touch before update on public.system_settings
  for each row execute function app.touch_updated_at();

create function app.validate_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Raises invalid_parameter_value for an unknown timezone name.
  perform now() at time zone new.timezone;
  if new.work_days is null or cardinality(new.work_days) = 0
     or not new.work_days <@ array[1,2,3,4,5,6,7]::smallint[] then
    raise exception 'work_days must contain ISO weekdays 1-7';
  end if;
  return new;
end;
$$;

create trigger system_settings_validate before insert or update on public.system_settings
  for each row execute function app.validate_settings();

create function app.attendance_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'attendance events are immutable';
end;
$$;

create trigger attendance_events_no_update before update or delete on public.attendance_events
  for each row execute function app.attendance_events_immutable();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app.settings() returns public.system_settings
language sql stable security definer set search_path = '' as $$
  select * from public.system_settings where id = 1;
$$;

-- Great-circle distance in metres.
create function app.distance_meters(lat1 double precision, lng1 double precision,
                                    lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 2 * 6371008.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Minute of the local day (0-1439). Seconds are ignored, so 09:00:59 counts as 09:00.
create function app.local_minute(ts timestamptz, tz text) returns integer
language sql immutable set search_path = '' as $$
  select (extract(hour from ts at time zone tz) * 60 + extract(minute from ts at time zone tz))::integer;
$$;

create function app.time_minute(t time) returns integer
language sql immutable set search_path = '' as $$
  select (extract(hour from t) * 60 + extract(minute from t))::integer;
$$;

-- Events the employee may submit next, given today's day row (null = none yet).
create function app.next_events(d public.attendance_days)
returns public.attendance_event_type[]
language sql immutable set search_path = '' as $$
  select case
    when d.id is null or d.work_in_at is null then array['WORK_IN']::public.attendance_event_type[]
    when d.work_out_at is not null then array[]::public.attendance_event_type[]
    when d.break_out_at is null then array['BREAK_OUT', 'WORK_OUT']::public.attendance_event_type[]
    when d.break_in_at is null then array['BREAK_IN']::public.attendance_event_type[]
    else array['WORK_OUT']::public.attendance_event_type[]
  end;
$$;

-- Recalculate every derived field on an attendance day from its timestamps.
create function app.recompute_day(p_day_id uuid) returns public.attendance_days
language plpgsql security definer set search_path = '' as $$
declare
  s public.system_settings := app.settings();
  d public.attendance_days;
  start_min integer := app.time_minute(s.work_start_time);
  end_min integer := app.time_minute(s.work_end_time);
  in_min integer;
  out_min integer;
begin
  select * into d from public.attendance_days where id = p_day_id for update;

  d.arrival_status := null;
  d.early_arrival_minutes := 0;
  d.late_minutes := 0;
  if d.work_in_at is not null then
    in_min := app.local_minute(d.work_in_at, s.timezone);
    d.early_arrival_minutes := greatest(0, start_min - in_min);
    d.late_minutes := greatest(0, in_min - start_min);
    d.arrival_status := case
      when in_min < start_min then 'EARLY'
      when in_min = start_min then 'ON_TIME'
      else 'LATE'
    end;
  end if;

  d.break_duration_minutes := null;
  d.excess_break_minutes := 0;
  d.break_status := case
    when d.break_out_at is null and d.work_out_at is not null then 'NO_BREAK'
    when d.break_out_at is null then null
    when d.break_in_at is null then 'INCOMPLETE'
  end::public.break_status;
  if d.break_out_at is not null and d.break_in_at is not null then
    d.break_duration_minutes := floor(extract(epoch from d.break_in_at - d.break_out_at) / 60)::integer;
    d.excess_break_minutes := greatest(0, d.break_duration_minutes - s.break_max_minutes);
    d.break_status := case when d.excess_break_minutes > 0 then 'BREAK_EXCEEDED' else 'WITHIN_LIMIT' end;
  end if;

  d.early_departure_minutes := 0;
  if d.work_out_at is null then
    d.departure_status := case when d.work_in_at is null then null else 'NOT_PUNCHED_OUT' end;
  else
    out_min := app.local_minute(d.work_out_at, s.timezone);
    d.early_departure_minutes := greatest(0, end_min - out_min);
    d.departure_status := case when out_min < end_min then 'EARLY_DEPARTURE' else 'COMPLETE' end;
  end if;

  d.completion_status := case
    when d.work_out_at is not null then 'COMPLETED'
    when d.break_in_at is not null then 'RETURNED_FROM_BREAK'
    when d.break_out_at is not null then 'ON_BREAK'
    when d.work_in_at is not null then 'WORKING'
    else 'NOT_STARTED'
  end;

  update public.attendance_days set
    arrival_status = d.arrival_status,
    early_arrival_minutes = d.early_arrival_minutes,
    late_minutes = d.late_minutes,
    break_status = d.break_status,
    break_duration_minutes = d.break_duration_minutes,
    excess_break_minutes = d.excess_break_minutes,
    departure_status = d.departure_status,
    early_departure_minutes = d.early_departure_minutes,
    completion_status = d.completion_status
  where id = p_day_id
  returning * into d;

  return d;
end;
$$;

create function app.fail(p_code text, p_message text, p_extra jsonb default '{}')
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'code', p_code, 'message', p_message) || p_extra;
$$;

-- ---------------------------------------------------------------------------
-- Current user helpers (security definer so RLS policies can call them
-- without recursing into profiles' own policies)
-- ---------------------------------------------------------------------------

create function app.current_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select * from public.profiles where auth_user_id = auth.uid() and is_active;
$$;

create function app.current_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (app.current_profile()).id;
$$;

create function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((app.current_profile()).role = 'admin', false);
$$;

-- Branch a manager may see, or null when the user is not a manager.
create function app.managed_branch_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p.role = 'manager' then p.branch_id end from app.current_profile() p;
$$;

-- ---------------------------------------------------------------------------
-- Attendance context: what the staff dashboard needs before submitting.
-- Location is optional; when given, the result says whether QR is required.
-- ---------------------------------------------------------------------------

create function app.attendance_context_at(
  p_auth_user_id uuid,
  p_now timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.system_settings := app.settings();
  p public.profiles;
  b public.branches;
  d public.attendance_days;
  today date := (p_now at time zone s.timezone)::date;
  next public.attendance_event_type[];
  dist double precision;
  within boolean;
begin
  select * into p from public.profiles where auth_user_id = p_auth_user_id;
  if p.id is null then
    return app.fail('NOT_AUTHENTICATED', 'Sila log masuk.');
  end if;
  select * into b from public.branches where id = p.branch_id;
  select * into d from public.attendance_days where employee_id = p.id and attendance_date = today;
  next := app.next_events(d);

  if p_latitude is not null and p_longitude is not null and b.id is not null then
    dist := app.distance_meters(p_latitude, p_longitude, b.latitude, b.longitude);
    within := dist <= b.allowed_radius_meters;
  end if;

  return jsonb_build_object(
    'ok', true,
    'today', today,
    'server_time', p_now,
    'timezone', s.timezone,
    'profile', jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'employee_code', p.employee_code,
      'role', p.role, 'is_active', p.is_active),
    'branch', case when b.id is null then null else jsonb_build_object('id', b.id, 'name', b.name) end,
    'day', case when d.id is null then null else to_jsonb(d) end,
    'completion_status', coalesce(d.completion_status, 'NOT_STARTED'),
    'next_events', to_jsonb(next),
    'distance_meters', round(dist::numeric, 1),
    'within_radius', within,
    -- WORK_IN/WORK_OUT always need QR; breaks need it only inside the radius.
    'qr_required', case
      when cardinality(next) = 0 then null
      when within is null then null
      else (select jsonb_object_agg(e, e in ('WORK_IN', 'WORK_OUT') or within) from unnest(next) e)
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance submission. Every check happens here, in one transaction.
-- p_intent is only used when more than one event is valid next (WORKING:
-- start break or clock out without a break); it can never skip the sequence.
-- ---------------------------------------------------------------------------

create function app.submit_attendance_at(
  p_auth_user_id uuid,
  p_now timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_qr_identifier text,
  p_intent public.attendance_event_type,
  p_client_time timestamptz
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.system_settings := app.settings();
  p public.profiles;
  b public.branches;
  qb public.branches;
  d public.attendance_days;
  today date := (p_now at time zone s.timezone)::date;
  next public.attendance_event_type[];
  ev public.attendance_event_type;
  dist double precision;
  within boolean;
  qr_needed boolean;
  qr text := nullif(trim(p_qr_identifier), '');
begin
  if p_auth_user_id is null then
    return app.fail('NOT_AUTHENTICATED', 'Sila log masuk.');
  end if;
  select * into p from public.profiles where auth_user_id = p_auth_user_id;
  if p.id is null then
    return app.fail('NOT_AUTHENTICATED', 'Akaun tidak dijumpai.');
  end if;
  if not p.is_active then
    return app.fail('USER_INACTIVE', 'Akaun anda tidak aktif.');
  end if;
  if p.role not in ('staff', 'manager') then
    return app.fail('ROLE_NOT_PERMITTED', 'Peranan anda tidak boleh merekod kehadiran.');
  end if;
  if p.branch_id is null then
    return app.fail('NO_BRANCH', 'Anda belum ditetapkan ke mana-mana cawangan.');
  end if;
  select * into b from public.branches where id = p.branch_id;
  if not b.is_active then
    return app.fail('BRANCH_INACTIVE', 'Cawangan anda tidak aktif.');
  end if;

  if p_latitude is null or p_longitude is null then
    return app.fail('LOCATION_UNAVAILABLE', 'Lokasi peranti tidak dapat diperoleh.');
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    return app.fail('LOCATION_UNAVAILABLE', 'Lokasi peranti tidak sah.');
  end if;
  if p_accuracy_meters is not null and p_accuracy_meters > s.max_location_accuracy_meters then
    return app.fail('LOCATION_INACCURATE', 'Ketepatan lokasi terlalu rendah. Cuba lagi di kawasan terbuka.',
      jsonb_build_object('accuracy_meters', p_accuracy_meters,
                         'max_accuracy_meters', s.max_location_accuracy_meters));
  end if;

  -- Serialise submissions per employee so double taps cannot race.
  perform pg_advisory_xact_lock(hashtextextended(p.id::text, 0));
  select * into d from public.attendance_days
    where employee_id = p.id and attendance_date = today for update;

  next := app.next_events(d);
  if cardinality(next) = 0 then
    return app.fail('DAY_COMPLETED', 'Kehadiran hari ini sudah lengkap.');
  end if;

  if p_intent is null then
    if cardinality(next) > 1 then
      return app.fail('INTENT_REQUIRED', 'Pilih sama ada mula rehat atau tamat kerja.',
        jsonb_build_object('next_events', to_jsonb(next)));
    end if;
    ev := next[1];
  elsif p_intent = any(next) then
    ev := p_intent;
  elsif (p_intent = 'WORK_IN' and d.work_in_at is not null)
     or (p_intent = 'BREAK_OUT' and d.break_out_at is not null)
     or (p_intent = 'BREAK_IN' and d.break_in_at is not null) then
    return app.fail('DUPLICATE_EVENT', 'Peringkat ini sudah direkodkan hari ini.');
  else
    return app.fail('INVALID_SEQUENCE', 'Urutan kehadiran tidak sah.',
      jsonb_build_object('next_events', to_jsonb(next)));
  end if;

  dist := app.distance_meters(p_latitude, p_longitude, b.latitude, b.longitude);
  within := dist <= b.allowed_radius_meters;

  if ev in ('WORK_IN', 'WORK_OUT') and not within then
    return app.fail('OUTSIDE_RADIUS', 'Anda berada di luar kawasan cawangan.',
      jsonb_build_object('distance_meters', round(dist::numeric, 1),
                         'allowed_radius_meters', b.allowed_radius_meters));
  end if;

  qr_needed := ev in ('WORK_IN', 'WORK_OUT') or within;
  if qr_needed then
    if qr is null then
      return app.fail('QR_REQUIRED', 'Sila imbas kod QR cawangan.',
        jsonb_build_object('event_type', ev));
    end if;
    select * into qb from public.branches where qr_identifier = qr;
    if qb.id is null or not qb.is_active then
      return app.fail('INVALID_QR', 'Kod QR tidak sah.');
    end if;
    if qb.id <> b.id then
      return app.fail('QR_WRONG_BRANCH', 'Kod QR ini milik cawangan lain.');
    end if;
  end if;

  if d.id is null then
    insert into public.attendance_days (employee_id, branch_id, attendance_date)
      values (p.id, b.id, today) returning * into d;
  end if;

  update public.attendance_days set
    work_in_at = case when ev = 'WORK_IN' then p_now else work_in_at end,
    break_out_at = case when ev = 'BREAK_OUT' then p_now else break_out_at end,
    break_in_at = case when ev = 'BREAK_IN' then p_now else break_in_at end,
    work_out_at = case when ev = 'WORK_OUT' then p_now else work_out_at end
  where id = d.id;

  insert into public.attendance_events (
    attendance_day_id, employee_id, branch_id, event_type, recorded_at,
    latitude, longitude, location_accuracy_meters, distance_from_branch_meters,
    qr_identifier_reference, verification_mode, is_remote_break, client_reported_at
  ) values (
    d.id, p.id, b.id, ev, p_now,
    p_latitude, p_longitude, p_accuracy_meters, dist,
    case when qr_needed then qr end,
    case when qr_needed then 'QR_AND_LOCATION' else 'REMOTE_LOCATION_ONLY' end::public.verification_mode,
    not qr_needed, p_client_time
  );

  d := app.recompute_day(d.id);

  return jsonb_build_object(
    'ok', true,
    'event_type', ev,
    'recorded_at', p_now,
    'is_remote_break', not qr_needed,
    'distance_meters', round(dist::numeric, 1),
    'day', to_jsonb(d)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin correction of an attendance day (e.g. forgotten clock-out).
-- Creates the day if the employee never punched in. Raw events are untouched.
-- ---------------------------------------------------------------------------

create function app.correct_attendance_as(
  p_auth_user_id uuid,
  p_employee_id uuid,
  p_date date,
  p_work_in_at timestamptz,
  p_break_out_at timestamptz,
  p_break_in_at timestamptz,
  p_work_out_at timestamptz,
  p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.system_settings := app.settings();
  admin_p public.profiles;
  emp public.profiles;
  d public.attendance_days;
  before_v jsonb;
  ts timestamptz;
begin
  select * into admin_p from public.profiles where auth_user_id = p_auth_user_id;
  if admin_p.id is null or not admin_p.is_active or admin_p.role <> 'admin' then
    return app.fail('FORBIDDEN', 'Hanya admin boleh membetulkan kehadiran.');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return app.fail('REASON_REQUIRED', 'Sebab pembetulan diperlukan.');
  end if;
  select * into emp from public.profiles where id = p_employee_id;
  if emp.id is null then
    return app.fail('NOT_FOUND', 'Pekerja tidak dijumpai.');
  end if;

  foreach ts in array array[p_work_in_at, p_break_out_at, p_break_in_at, p_work_out_at] loop
    if ts is not null and (ts at time zone s.timezone)::date <> p_date then
      return app.fail('INVALID_TIMES', 'Semua masa mesti pada tarikh yang sama.');
    end if;
  end loop;
  if (p_break_out_at is not null and (p_work_in_at is null or p_break_out_at < p_work_in_at))
     or (p_break_in_at is not null and (p_break_out_at is null or p_break_in_at < p_break_out_at))
     or (p_work_out_at is not null and (p_work_in_at is null
         or p_work_out_at < coalesce(p_break_in_at, p_work_in_at)))
     or (p_work_out_at is not null and p_break_out_at is not null and p_break_in_at is null) then
    return app.fail('INVALID_SEQUENCE', 'Urutan masa tidak sah.');
  end if;

  select * into d from public.attendance_days
    where employee_id = emp.id and attendance_date = p_date for update;
  if d.id is null then
    if emp.branch_id is null then
      return app.fail('NO_BRANCH', 'Pekerja belum ditetapkan ke cawangan.');
    end if;
    insert into public.attendance_days (employee_id, branch_id, attendance_date)
      values (emp.id, emp.branch_id, p_date) returning * into d;
  end if;
  before_v := jsonb_build_object('work_in_at', d.work_in_at, 'break_out_at', d.break_out_at,
                                 'break_in_at', d.break_in_at, 'work_out_at', d.work_out_at);

  update public.attendance_days set
    work_in_at = p_work_in_at, break_out_at = p_break_out_at,
    break_in_at = p_break_in_at, work_out_at = p_work_out_at
  where id = d.id;
  d := app.recompute_day(d.id);

  insert into public.attendance_corrections (attendance_day_id, corrected_by, reason, before_values, after_values)
  values (d.id, admin_p.id, trim(p_reason), before_v,
          jsonb_build_object('work_in_at', d.work_in_at, 'break_out_at', d.break_out_at,
                             'break_in_at', d.break_in_at, 'work_out_at', d.work_out_at));

  return jsonb_build_object('ok', true, 'day', to_jsonb(d));
end;
$$;

-- Recalculate all days after a policy change (admin only, from Settings).
create function app.recompute_days_between(p_from date, p_to date) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.attendance_days where attendance_date between p_from and p_to loop
    perform app.recompute_day(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting view. A day before today that never reached COMPLETED is shown as
-- INCOMPLETE. security_invoker keeps the caller's RLS in force.
-- ---------------------------------------------------------------------------

create view public.attendance_day_report with (security_invoker = true) as
select
  d.*,
  case
    when d.completion_status <> 'COMPLETED'
     and d.attendance_date < (now() at time zone (app.settings()).timezone)::date
    then 'INCOMPLETE'::public.completion_status
    else d.completion_status
  end as effective_status,
  p.full_name,
  p.employee_code,
  b.name as branch_name
from public.attendance_days d
join public.profiles p on p.id = d.employee_id
join public.branches b on b.id = d.branch_id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.system_settings enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.public_holidays enable row level security;

create policy settings_read on public.system_settings for select to authenticated using (true);
create policy settings_admin_update on public.system_settings for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy holidays_read on public.public_holidays for select to authenticated using (true);
create policy holidays_admin_write on public.public_holidays for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy branches_read on public.branches for select to authenticated
  using (app.is_admin() or id = (app.current_profile()).branch_id);
create policy branches_admin_write on public.branches for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy profiles_read on public.profiles for select to authenticated
  using (auth_user_id = auth.uid() or app.is_admin() or branch_id = app.managed_branch_id());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy days_read on public.attendance_days for select to authenticated
  using (employee_id = app.current_profile_id() or app.is_admin() or branch_id = app.managed_branch_id());

create policy events_read on public.attendance_events for select to authenticated
  using (employee_id = app.current_profile_id() or app.is_admin() or branch_id = app.managed_branch_id());

create policy corrections_read on public.attendance_corrections for select to authenticated
  using (app.is_admin() or exists (
    select 1 from public.attendance_days d
    where d.id = attendance_day_id
      and (d.employee_id = app.current_profile_id() or d.branch_id = app.managed_branch_id())));

-- Attendance tables are written only through the functions above.
revoke insert, update, delete, truncate on public.attendance_days, public.attendance_events,
  public.attendance_corrections from anon, authenticated;
revoke all on public.system_settings, public.branches, public.profiles, public.public_holidays,
  public.attendance_days, public.attendance_events, public.attendance_corrections,
  public.attendance_day_report from anon;

-- ---------------------------------------------------------------------------
-- Public RPC entry points (the only functions the API exposes)
-- ---------------------------------------------------------------------------

create function public.get_attendance_context(
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.attendance_context_at(auth.uid(), now(), p_latitude, p_longitude);
$$;

create function public.submit_attendance(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null,
  p_qr_identifier text default null,
  p_intent public.attendance_event_type default null,
  p_client_time timestamptz default null
) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select app.submit_attendance_at(auth.uid(), now(), p_latitude, p_longitude,
                                  p_accuracy_meters, p_qr_identifier, p_intent, p_client_time);
$$;

create function public.admin_correct_attendance(
  p_employee_id uuid,
  p_date date,
  p_work_in_at timestamptz,
  p_break_out_at timestamptz,
  p_break_in_at timestamptz,
  p_work_out_at timestamptz,
  p_reason text
) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select app.correct_attendance_as(auth.uid(), p_employee_id, p_date, p_work_in_at,
                                   p_break_out_at, p_break_in_at, p_work_out_at, p_reason);
$$;

create function public.admin_recompute_days(p_from date, p_to date) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.recompute_days_between(p_from, p_to);
end;
$$;

-- Functions are executable by PUBLIC by default; lock everything down first.
revoke all on all functions in schema app from public, anon, authenticated;
revoke all on function public.get_attendance_context(double precision, double precision),
  public.submit_attendance(double precision, double precision, double precision, text,
                           public.attendance_event_type, timestamptz),
  public.admin_correct_attendance(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, text),
  public.admin_recompute_days(date, date)
  from public, anon;
grant execute on function public.get_attendance_context(double precision, double precision),
  public.submit_attendance(double precision, double precision, double precision, text,
                           public.attendance_event_type, timestamptz),
  public.admin_correct_attendance(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, text),
  public.admin_recompute_days(date, date)
  to authenticated;

-- RLS policies call these helpers as the querying role.
grant usage on schema app to authenticated;
grant execute on function app.current_profile(), app.current_profile_id(), app.is_admin(),
  app.managed_branch_id(), app.settings() to authenticated;
