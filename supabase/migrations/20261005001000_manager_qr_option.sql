-- Admin chooses per manager whether they may punch anywhere without QR
-- (profiles.qr_exempt). Existing managers keep the no-QR behaviour they have
-- today; new managers must scan QR until an admin allows otherwise. Only admins
-- can write profiles (RLS), so managers cannot change this themselves.
alter table public.profiles add column qr_exempt boolean not null default false;
update public.profiles set qr_exempt = true where role = 'manager';

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
  exempt boolean;
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
  -- Managers the admin allowed punch anywhere without QR; GPS is still required and stored.
  exempt := p.role = 'manager' and p.qr_exempt;
  field := exempt or exists (select 1 from public.field_work_permits
                             where employee_id = p.id and work_date = today);
  away := field and not within;

  if ev in ('WORK_IN', 'WORK_OUT', 'EXTRA_IN', 'EXTRA_OUT') and not within and not field then
    return app.fail('OUTSIDE_RADIUS', 'Anda berada di luar kawasan cawangan.',
      jsonb_build_object('distance_meters', round(dist::numeric, 1),
                         'allowed_radius_meters', b.allowed_radius_meters));
  end if;

  qr_needed := not exempt and ((ev in ('WORK_IN', 'WORK_OUT', 'EXTRA_IN', 'EXTRA_OUT') and not away) or within);
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
    not qr_needed and not (exempt and within) and ev in ('BREAK_OUT', 'BREAK_IN'), p_client_time
  );

  if away then
    update public.attendance_days set is_field_work = true where id = d.id;
  end if;

  d := app.recompute_day(d.id);

  return jsonb_build_object(
    'ok', true,
    'event_type', ev,
    'recorded_at', p_now,
    'is_remote_break', not qr_needed and not (exempt and within) and ev in ('BREAK_OUT', 'BREAK_IN'),
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
    -- QR-exempt managers never need QR. For others WORK_IN/WORK_OUT always need QR; breaks only inside the radius.
    'qr_required', case
      when cardinality(next) = 0 then null
      when p.role = 'manager' and p.qr_exempt then (select jsonb_object_agg(e, false) from unnest(next) e)
      when within is null then null
      else (select jsonb_object_agg(e, (e in ('WORK_IN', 'WORK_OUT', 'EXTRA_IN', 'EXTRA_OUT') and permit.id is null) or within)
            from unnest(next) e)
    end,
    'field_work', permit.id is not null,
    'field_work_note', permit.note,
    'qr_exempt', p.role = 'manager' and p.qr_exempt
  );
end;
$$;
