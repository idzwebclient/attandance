-- Punch problems log. Every failed punch is kept so the admin can see why a
-- staff member could not punch (camera, GPS, outside radius, wrong QR, ...)
-- instead of only the staff seeing the error on their phone.
--
-- source 'server': refused by submit_attendance (logged here, in the database).
-- source 'device': failed on the phone before reaching the server (camera or
-- GPS permission, no camera, QR not read, no internet), sent by the app.

create table public.punch_issues (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('server', 'device')),
  code text not null,
  message text,
  event_type text,
  distance_meters numeric,
  allowed_radius_meters integer,
  accuracy_meters numeric,
  detail text,
  user_agent text
);

create index punch_issues_occurred_idx on public.punch_issues (occurred_at desc);
create index punch_issues_employee_idx on public.punch_issues (employee_id, occurred_at desc);

alter table public.punch_issues enable row level security;
revoke all on public.punch_issues from anon;
revoke insert, update, delete, truncate on public.punch_issues from authenticated;
grant select on public.punch_issues to authenticated;

create policy punch_issues_admin_read on public.punch_issues
  for select to authenticated using (app.is_admin());

-- Writes one row. Keeps 90 days, and skips a repeat of the same problem by the
-- same person within a minute so retry taps do not flood the list.
create function app.log_punch_issue(
  p_employee_id uuid,
  p_source text,
  p_code text,
  p_message text,
  p_event_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_detail text,
  p_occurred_at timestamptz default now()
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.profiles;
  b public.branches;
  dist double precision;
  ua text;
begin
  select * into p from public.profiles where id = p_employee_id;
  if p.id is null then
    return;
  end if;
  if exists (select 1 from public.punch_issues
             where employee_id = p.id and code = p_code and source = p_source
               and occurred_at > p_occurred_at - interval '1 minute') then
    return;
  end if;
  select * into b from public.branches where id = p.branch_id;
  if b.id is not null and p_latitude between -90 and 90 and p_longitude between -180 and 180 then
    dist := app.distance_meters(p_latitude, p_longitude, b.latitude, b.longitude);
  end if;
  begin
    ua := current_setting('request.headers', true)::json ->> 'user-agent';
  exception when others then
    ua := null;
  end;

  delete from public.punch_issues where occurred_at < now() - interval '90 days';
  insert into public.punch_issues (
    employee_id, branch_id, occurred_at, source, code, message, event_type,
    distance_meters, allowed_radius_meters, accuracy_meters, detail, user_agent
  ) values (
    p.id, b.id, p_occurred_at, p_source, p_code, left(p_message, 300), left(p_event_type, 20),
    round(dist::numeric, 1), b.allowed_radius_meters, round(p_accuracy::numeric, 1),
    left(p_detail, 300), left(ua, 300)
  );
end;
$$;

-- Same API as before; now keeps a record whenever the punch is refused.
-- QR_REQUIRED is the normal "now scan the QR" step, not a problem.
create or replace function public.submit_attendance(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null,
  p_qr_identifier text default null,
  p_intent public.attendance_event_type default null,
  p_client_time timestamptz default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r jsonb;
  pid uuid;
begin
  r := app.submit_attendance_at(auth.uid(), now(), p_latitude, p_longitude,
                                p_accuracy_meters, p_qr_identifier, p_intent, p_client_time);
  if not coalesce((r ->> 'ok')::boolean, false)
     and r ->> 'code' not in ('QR_REQUIRED', 'NOT_AUTHENTICATED') then
    select id into pid from public.profiles where auth_user_id = auth.uid();
    if pid is not null then
      perform app.log_punch_issue(pid, 'server', r ->> 'code', r ->> 'message',
        coalesce(r ->> 'event_type', p_intent::text), p_latitude, p_longitude, p_accuracy_meters,
        case when p_qr_identifier is not null then 'QR diimbas' end);
    end if;
  end if;
  return r;
end;
$$;

-- Called by the app when a punch fails on the phone itself. Only known codes
-- are accepted. occurred_at may be earlier when the report waited for internet.
create function public.report_punch_issue(
  p_code text,
  p_message text default null,
  p_event_type text default null,
  p_detail text default null,
  p_accuracy double precision default null,
  p_occurred_at timestamptz default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  pid uuid := app.current_profile_id();
begin
  if pid is null or p_code not in (
    'CAMERA_DENIED', 'CAMERA_UNAVAILABLE', 'NO_CAMERA', 'NOT_BRANCH_QR', 'SCAN_CANCELLED',
    'LOCATION_DENIED', 'LOCATION_TIMEOUT', 'LOCATION_UNAVAILABLE', 'LOCATION_UNSUPPORTED',
    'OFFLINE', 'SERVER_UNREACHABLE', 'SERVER_ERROR'
  ) then
    return;
  end if;
  perform app.log_punch_issue(pid, 'device', p_code, p_message, p_event_type, null, null, p_accuracy,
    p_detail, least(now(), greatest(coalesce(p_occurred_at, now()), now() - interval '7 days')));
end;
$$;

revoke all on function app.log_punch_issue(uuid, text, text, text, text, double precision, double precision, double precision, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.report_punch_issue(text, text, text, text, double precision, timestamptz) from public, anon;
grant execute on function public.report_punch_issue(text, text, text, text, double precision, timestamptz) to authenticated;
