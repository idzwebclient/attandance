-- Monthly attendance summary per employee. Runs with the caller's rights, so
-- RLS limits it to the caller's own record, managed branch, or everything for admins.
--
-- absent_days counts configured work days (minus public holidays) from the later
-- of the month start and the employee's creation date, up to yesterday, with no
-- attendance recorded.

create function public.monthly_summary(
  p_month date,
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
  absent_days integer
)
language sql stable security invoker set search_path = '' as $$
  with s as (
    select * from app.settings()
  ),
  bounds as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as m_end,
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
                         and d.attendance_date < (select today from bounds))::integer as incomplete_days
    from days d
    group by d.employee_id
  ),
  work_dates as (
    select g::date as work_date
    from bounds, generate_series(bounds.m_start, least(bounds.m_end, bounds.today - 1), interval '1 day') g
    where extract(isodow from g)::smallint = any ((select work_days from s)::smallint[])
      and not exists (select 1 from public.public_holidays h where h.holiday_date = g::date)
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
    coalesce(a.incomplete_days, 0), coalesce(ab.absent_days, 0)
  from emp e
  left join agg a on a.employee_id = e.id
  left join absent ab on ab.employee_id = e.id
  where e.is_active or a.employee_id is not null
  order by e.full_name;
$$;

revoke all on function public.monthly_summary(date, uuid, uuid) from public, anon;
grant execute on function public.monthly_summary(date, uuid, uuid) to authenticated;
