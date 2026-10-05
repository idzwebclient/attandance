-- Field work ("Kerja luar"): a manager or admin approves an employee to work
-- away from the branch on given dates. On those days punches made outside the
-- branch radius need no QR; GPS is still required and stored, and the day is
-- flagged is_field_work. Inside the radius the normal QR rules still apply.

create table public.field_work_permits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid references public.branches (id),
  work_date date not null,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index field_work_permits_date_idx on public.field_work_permits (work_date);

alter table public.field_work_permits enable row level security;
create policy field_work_read on public.field_work_permits for select to authenticated
  using (employee_id = app.current_profile_id() or app.is_admin() or branch_id = app.managed_branch_id());
-- Written only through the functions below.
revoke insert, update, delete, truncate on public.field_work_permits from anon, authenticated;
revoke all on public.field_work_permits from anon;

alter table public.attendance_days add column is_field_work boolean not null default false;

-- Admins for anyone; managers for employees of their own branch.
create function app.can_manage_employee(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() or exists (
    select 1 from public.profiles e
    where e.id = p_employee_id and e.branch_id is not null and e.branch_id = app.managed_branch_id());
$$;

create function public.grant_field_work(p_employee_id uuid, p_from date, p_to date, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  emp public.profiles;
  n integer;
begin
  if not app.can_manage_employee(p_employee_id) then
    return app.fail('FORBIDDEN', 'Anda tidak boleh menetapkan kerja luar untuk pekerja ini.');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return app.fail('INVALID_DATES', 'Julat tarikh tidak sah (maksimum 2 bulan).');
  end if;
  select * into emp from public.profiles where id = p_employee_id;
  insert into public.field_work_permits (employee_id, branch_id, work_date, note, created_by)
  select emp.id, emp.branch_id, g::date, nullif(trim(p_note), ''), app.current_profile_id()
  from generate_series(p_from, p_to, interval '1 day') g
  on conflict (employee_id, work_date) do update set note = excluded.note;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'days', n);
end;
$$;

create function public.revoke_field_work(p_permit_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  permit public.field_work_permits;
begin
  select * into permit from public.field_work_permits where id = p_permit_id;
  if permit.id is null then
    return app.fail('NOT_FOUND', 'Rekod tidak dijumpai.');
  end if;
  if not app.can_manage_employee(permit.employee_id) then
    return app.fail('FORBIDDEN', 'Anda tidak boleh membatalkan rekod ini.');
  end if;
  delete from public.field_work_permits where id = p_permit_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function app.can_manage_employee(uuid) from public, anon, authenticated;
revoke all on function public.grant_field_work(uuid, date, date, text), public.revoke_field_work(uuid) from public, anon;
grant execute on function public.grant_field_work(uuid, date, date, text), public.revoke_field_work(uuid) to authenticated;

create or replace function app.submit_attendance_at(
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
  field boolean;
  away boolean;
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
  -- A finished day only reopens when the employee explicitly asks for an extra session.
  if cardinality(next) = 0 or (next = array['EXTRA_IN']::public.attendance_event_type[] and p_intent is null) then
    return app.fail('DAY_COMPLETED', 'Kehadiran hari ini sudah lengkap.',
      jsonb_build_object('next_events', to_jsonb(next)));
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

  -- Approved field work: punches away from the branch need no QR or radius.
  field := exists (select 1 from public.field_work_permits
                   where employee_id = p.id and work_date = today);
  away := field and not within;

  if ev in ('WORK_IN', 'WORK_OUT', 'EXTRA_IN', 'EXTRA_OUT') and not within and not field then
    return app.fail('OUTSIDE_RADIUS', 'Anda berada di luar kawasan cawangan.',
      jsonb_build_object('distance_meters', round(dist::numeric, 1),
                         'allowed_radius_meters', b.allowed_radius_meters));
  end if;

  qr_needed := (ev in ('WORK_IN', 'WORK_OUT', 'EXTRA_IN', 'EXTRA_OUT') and not away) or within;
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

  if ev = 'EXTRA_IN' then
    insert into public.attendance_extra_sessions (attendance_day_id, employee_id, branch_id, started_at)
      values (d.id, p.id, b.id, p_now);
  elsif ev = 'EXTRA_OUT' then
    update public.attendance_extra_sessions
      set ended_at = p_now,
          minutes = floor(extract(epoch from p_now - started_at) / 60)::integer
      where attendance_day_id = d.id and ended_at is null;
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
    case when qr_needed then 'QR_AND_LOCATION'
         when away and ev not in ('BREAK_OUT', 'BREAK_IN') then 'FIELD_LOCATION_ONLY'
         else 'REMOTE_LOCATION_ONLY' end::public.verification_mode,
    not qr_needed and ev in ('BREAK_OUT', 'BREAK_IN'), p_client_time
  );

  if away then
    update public.attendance_days set is_field_work = true where id = d.id;
  end if;

  d := app.recompute_day(d.id);

  return jsonb_build_object(
    'ok', true,
    'event_type', ev,
    'recorded_at', p_now,
    'is_remote_break', not qr_needed and ev in ('BREAK_OUT', 'BREAK_IN'),
    'is_field_work', away and ev not in ('BREAK_OUT', 'BREAK_IN'),
    'distance_meters', round(dist::numeric, 1),
    'day', to_jsonb(d)
  );
end;
$$;

create or replace function app.attendance_context_at(
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
  permit public.field_work_permits;
begin
  select * into p from public.profiles where auth_user_id = p_auth_user_id;
  if p.id is null then
    return app.fail('NOT_AUTHENTICATED', 'Sila log masuk.');
  end if;
  select * into b from public.branches where id = p.branch_id;
  select * into d from public.attendance_days where employee_id = p.id and attendance_date = today;
  next := app.next_events(d);
  select * into permit from public.field_work_permits where employee_id = p.id and work_date = today;

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
      else (select jsonb_object_agg(e, (e in ('WORK_IN', 'WORK_OUT', 'EXTRA_IN', 'EXTRA_OUT') and permit.id is null) or within)
            from unnest(next) e)
    end,
    'field_work', permit.id is not null,
    'field_work_note', permit.note
  );
end;
$$;

-- The report view lists the day's columns explicitly via d.*, so rebuild it.
drop view public.attendance_day_report;
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
revoke all on public.attendance_day_report from anon;
grant select on public.attendance_day_report to authenticated;

-- Range summary gains field-work days.
drop function public.attendance_summary(date, date, uuid, uuid);
create function public.attendance_summary(
  p_from date,
  p_to date,
  p_branch_id uuid default null,
  p_employee_id uuid default null
) returns table (
  employee_id uuid,
  full_name text,
  employee_code text,
  branch_id uuid,
  branch_name text,
  recorded_days integer,
  early_arrivals integer,
  on_time_arrivals integer,
  late_arrivals integer,
  total_late_minutes integer,
  excess_breaks integer,
  total_excess_break_minutes integer,
  early_departures integer,
  total_early_departure_minutes integer,
  completed_days integer,
  incomplete_days integer,
  absent_days integer,
  extra_sessions integer,
  total_extra_minutes integer,
  field_work_days integer
)
language sql stable security invoker set search_path = '' as $$
  with s as (
    select * from app.settings()
  ),
  bounds as (
    select p_from as m_start,
           p_to as m_end,
           (now() at time zone (select timezone from s))::date as today
  ),
  emp as (
    select p.*, b.name as branch_name
    from public.profiles p
    left join public.branches b on b.id = p.branch_id
    where p.role in ('staff', 'manager')
      and (p_branch_id is null or p.branch_id = p_branch_id)
      and (p_employee_id is null or p.id = p_employee_id)
  ),
  days as (
    select d.*
    from public.attendance_days d, bounds
    where d.attendance_date between bounds.m_start and bounds.m_end
  ),
  agg as (
    select
      d.employee_id,
      count(*)::integer as recorded_days,
      count(*) filter (where d.arrival_status = 'EARLY')::integer as early_arrivals,
      count(*) filter (where d.arrival_status = 'ON_TIME')::integer as on_time_arrivals,
      count(*) filter (where d.arrival_status = 'LATE')::integer as late_arrivals,
      coalesce(sum(d.late_minutes), 0)::integer as total_late_minutes,
      count(*) filter (where d.break_status = 'BREAK_EXCEEDED')::integer as excess_breaks,
      coalesce(sum(d.excess_break_minutes), 0)::integer as total_excess_break_minutes,
      count(*) filter (where d.departure_status = 'EARLY_DEPARTURE')::integer as early_departures,
      coalesce(sum(d.early_departure_minutes), 0)::integer as total_early_departure_minutes,
      count(*) filter (where d.completion_status = 'COMPLETED')::integer as completed_days,
      count(*) filter (where d.completion_status <> 'COMPLETED'
                         and d.attendance_date < (select today from bounds))::integer as incomplete_days,
      coalesce(sum(d.extra_minutes), 0)::integer as total_extra_minutes,
      count(*) filter (where d.is_field_work)::integer as field_work_days
    from days d
    group by d.employee_id
  ),
  work_dates as (
    select g::date as work_date
    from bounds, generate_series(bounds.m_start, least(bounds.m_end, bounds.today - 1), interval '1 day') g
    where extract(isodow from g)::smallint = any ((select work_days from s)::smallint[])
      and not exists (select 1 from public.public_holidays h where h.holiday_date = g::date)
  ),
  extras as (
    select x.employee_id, count(*)::integer as extra_sessions
    from public.attendance_extra_sessions x
    join days d on d.id = x.attendance_day_id
    where x.ended_at is not null
    group by x.employee_id
  ),
  absent as (
    select e.id as employee_id, count(*)::integer as absent_days
    from emp e
    join work_dates w on w.work_date >= (e.created_at at time zone (select timezone from s))::date
    where e.is_active
      and not exists (select 1 from days d where d.employee_id = e.id and d.attendance_date = w.work_date)
    group by e.id
  )
  select
    e.id, e.full_name, e.employee_code, e.branch_id, e.branch_name,
    coalesce(a.recorded_days, 0), coalesce(a.early_arrivals, 0), coalesce(a.on_time_arrivals, 0),
    coalesce(a.late_arrivals, 0), coalesce(a.total_late_minutes, 0), coalesce(a.excess_breaks, 0),
    coalesce(a.total_excess_break_minutes, 0), coalesce(a.early_departures, 0),
    coalesce(a.total_early_departure_minutes, 0), coalesce(a.completed_days, 0),
    coalesce(a.incomplete_days, 0), coalesce(ab.absent_days, 0),
    coalesce(x.extra_sessions, 0), coalesce(a.total_extra_minutes, 0), coalesce(a.field_work_days, 0)
  from emp e
  left join agg a on a.employee_id = e.id
  left join absent ab on ab.employee_id = e.id
  left join extras x on x.employee_id = e.id
  where e.is_active or a.employee_id is not null
  order by e.full_name;
$$;


revoke all on function public.attendance_summary(date, date, uuid, uuid) from public, anon;
grant execute on function public.attendance_summary(date, date, uuid, uuid) to authenticated;
