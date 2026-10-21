-- Length of service for annual leave counts from the end of probation when
-- set, otherwise from the hire date.
create or replace function app.leave_entitlement(p_employee_id uuid, p_type public.leave_type, p_year integer)
returns integer
language sql stable security definer set search_path = '' as $$
  select case when p_type = 'ANNUAL' then coalesce(
      p.annual_leave_days,
      (select t.days from public.annual_leave_tiers t
       where coalesce(p.probation_end_date, p.hire_date) is not null
         and t.min_years <= extract(year from age(make_date(p_year, 1, 1), coalesce(p.probation_end_date, p.hire_date)))
       order by t.min_years desc limit 1),
      pol.annual_days)
    else pol.annual_days end
  from public.profiles p, public.leave_policies pol
  where p.id = p_employee_id and pol.leave_type = p_type;
$$;
