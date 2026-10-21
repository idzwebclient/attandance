-- Leave ("Cuti"): staff and managers apply; a manager approves staff of their
-- own branch, an admin approves anyone. Nobody approves their own request.
-- Approved leave days are not counted as absences.

create type public.leave_type as enum ('ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'OTHER');
create type public.leave_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid references public.branches (id),
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text,
  status public.leave_status not null default 'PENDING',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_status_idx on public.leave_requests (status, start_date);

alter table public.leave_requests enable row level security;
create policy leave_read on public.leave_requests for select to authenticated
  using (employee_id = app.current_profile_id() or app.is_admin() or branch_id = app.managed_branch_id());
-- Written only through the functions below.
revoke insert, update, delete, truncate on public.leave_requests from anon, authenticated;
revoke all on public.leave_requests from anon;

create function public.apply_leave(p_type public.leave_type, p_from date, p_to date, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.profiles := app.current_profile();
  r public.leave_requests;
begin
  if me.id is null or not me.is_active or me.role not in ('staff', 'manager') then
    return app.fail('FORBIDDEN', 'Hanya staf dan manager boleh memohon cuti.');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return app.fail('INVALID_DATES', 'Julat tarikh tidak sah (maksimum 2 bulan).');
  end if;
  if exists (select 1 from public.leave_requests l
             where l.employee_id = me.id and l.status in ('PENDING', 'APPROVED')
               and l.start_date <= p_to and l.end_date >= p_from) then
    return app.fail('OVERLAP', 'Anda sudah ada permohonan cuti pada tarikh ini.');
  end if;
  insert into public.leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason)
  values (me.id, me.branch_id, p_type, p_from, p_to, nullif(trim(p_reason), ''))
  returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end;
$$;

create function public.cancel_leave(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if r.id is null or r.employee_id <> app.current_profile_id() then
    return app.fail('NOT_FOUND', 'Permohonan tidak dijumpai.');
  end if;
  if r.status <> 'PENDING' then
    return app.fail('NOT_PENDING', 'Hanya permohonan yang belum diputuskan boleh dibatalkan.');
  end if;
  update public.leave_requests set status = 'CANCELLED' where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.leave_requests;
  emp public.profiles;
  me uuid := app.current_profile_id();
begin
  select * into r from public.leave_requests where id = p_id for update;
  if r.id is null then
    return app.fail('NOT_FOUND', 'Permohonan tidak dijumpai.');
  end if;
  select * into emp from public.profiles where id = r.employee_id;
  -- Managers decide for staff of their own branch only; a manager's own leave goes to an admin.
  if r.employee_id = me
     or not (app.is_admin() or (emp.role = 'staff' and app.can_manage_employee(r.employee_id))) then
    return app.fail('FORBIDDEN', 'Anda tidak boleh meluluskan permohonan ini.');
  end if;
  if r.status not in ('PENDING', 'APPROVED') or (r.status = 'APPROVED' and p_approve) then
    return app.fail('NOT_PENDING', 'Permohonan ini sudah diputuskan.');
  end if;
  update public.leave_requests set
    status = case when p_approve then 'APPROVED' else 'REJECTED' end::public.leave_status,
    decided_by = me,
    decided_at = now(),
    decision_note = nullif(trim(p_note), '')
  where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.apply_leave(public.leave_type, date, date, text),
  public.cancel_leave(uuid), public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.apply_leave(public.leave_type, date, date, text),
  public.cancel_leave(uuid), public.decide_leave(uuid, boolean, text) to authenticated;

-- Summary: approved leave days are reported as leave_days, not absences.
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
  field_work_days integer,
  leave_days integer
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
  leave_dates as (
    select distinct l.employee_id, g::date as work_date
    from public.leave_requests l, bounds,
         generate_series(greatest(l.start_date, bounds.m_start), least(l.end_date, bounds.m_end), interval '1 day') g
    where l.status = 'APPROVED'
      and extract(isodow from g)::smallint = any ((select work_days from s)::smallint[])
      and not exists (select 1 from public.public_holidays h where h.holiday_date = g::date)
  ),
  absent as (
    select e.id as employee_id, count(*)::integer as absent_days
    from emp e
    join work_dates w on w.work_date >= (e.created_at at time zone (select timezone from s))::date
    where e.is_active
      and not exists (select 1 from days d where d.employee_id = e.id and d.attendance_date = w.work_date)
      and not exists (select 1 from leave_dates ld where ld.employee_id = e.id and ld.work_date = w.work_date)
    group by e.id
  ),
  on_leave as (
    select ld.employee_id, count(*)::integer as leave_days
    from leave_dates ld
    where not exists (select 1 from days d where d.employee_id = ld.employee_id and d.attendance_date = ld.work_date)
    group by ld.employee_id
  )
  select
    e.id, e.full_name, e.employee_code, e.branch_id, e.branch_name,
    coalesce(a.recorded_days, 0), coalesce(a.early_arrivals, 0), coalesce(a.on_time_arrivals, 0),
    coalesce(a.late_arrivals, 0), coalesce(a.total_late_minutes, 0), coalesce(a.excess_breaks, 0),
    coalesce(a.total_excess_break_minutes, 0), coalesce(a.early_departures, 0),
    coalesce(a.total_early_departure_minutes, 0), coalesce(a.completed_days, 0),
    coalesce(a.incomplete_days, 0), coalesce(ab.absent_days, 0),
    coalesce(x.extra_sessions, 0), coalesce(a.total_extra_minutes, 0), coalesce(a.field_work_days, 0), coalesce(lv.leave_days, 0)
  from emp e
  left join agg a on a.employee_id = e.id
  left join absent ab on ab.employee_id = e.id
  left join on_leave lv on lv.employee_id = e.id
  left join extras x on x.employee_id = e.id
  where e.is_active or a.employee_id is not null
  order by e.full_name;
$$;


revoke all on function public.attendance_summary(date, date, uuid, uuid) from public, anon;
grant execute on function public.attendance_summary(date, date, uuid, uuid) to authenticated;
