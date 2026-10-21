-- Prorate annual leave in the first year of service (Employment Act s.60E):
-- tier days x completed months from the service start (end of probation, else
-- hire date) to 31 Dec, / 12. Half a day or more rounds up, less is dropped.
-- A personal override (annual_leave_days) is taken as given.
create or replace function app.leave_entitlement(p_employee_id uuid, p_type public.leave_type, p_year integer)
returns integer
language sql stable security definer set search_path = '' as $$
  with e as (
    select p.annual_leave_days, coalesce(p.probation_end_date, p.hire_date) as service_start
    from public.profiles p where p.id = p_employee_id
  ),
  tier as (
    select t.days from public.annual_leave_tiers t, e
    where e.service_start is not null
      and t.min_years <= extract(year from age(make_date(p_year, 1, 1), e.service_start))
    order by t.min_years desc limit 1
  ),
  months as (
    -- Completed months of service in p_year (12 for a full year).
    select case
      when e.service_start is null or extract(year from e.service_start) < p_year then 12
      when extract(year from e.service_start) > p_year then 0
      else (extract(year from age(make_date(p_year + 1, 1, 1), e.service_start)) * 12
            + extract(month from age(make_date(p_year + 1, 1, 1), e.service_start)))::integer
    end as n
    from e
  )
  select case when p_type = 'ANNUAL' then coalesce(
      e.annual_leave_days,
      case when extract(year from e.service_start) > p_year then 0 end,
      (select floor(tier.days * months.n / 12.0 + 0.5)::integer from tier, months),
      pol.annual_days)
    else pol.annual_days end
  from e, public.leave_policies pol
  where pol.leave_type = p_type;
$$;
