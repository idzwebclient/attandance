-- Admin-set leave policy per type: on/off and days per calendar year
-- (null = no limit). Pending and approved requests count towards the limit;
-- only work days that are not public holidays are counted.
--
-- Annual leave can instead depend on length of service: each employee has a
-- hire date, admins define tiers ("from N completed years: D days"), and an
-- employee may have a personal override.

create table public.leave_policies (
  leave_type public.leave_type primary key,
  is_active boolean not null default true,
  annual_days integer check (annual_days >= 0),
  updated_at timestamptz not null default now()
);

insert into public.leave_policies (leave_type)
select unnest(enum_range(null::public.leave_type));

alter table public.leave_policies enable row level security;
create policy leave_policies_read on public.leave_policies for select to authenticated using (true);
create policy leave_policies_admin_update on public.leave_policies for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
revoke insert, delete, truncate on public.leave_policies from anon, authenticated;
revoke all on public.leave_policies from anon;

alter table public.profiles
  add column hire_date date,
  add column annual_leave_days integer check (annual_leave_days >= 0);

create table public.annual_leave_tiers (
  min_years integer primary key check (min_years >= 0),
  days integer not null check (days >= 0)
);
-- Employment Act 1955 minimums; admins can change them.
insert into public.annual_leave_tiers values (0, 8), (2, 12), (5, 16);

alter table public.annual_leave_tiers enable row level security;
create policy annual_leave_tiers_read on public.annual_leave_tiers for select to authenticated using (true);
create policy annual_leave_tiers_admin on public.annual_leave_tiers for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
revoke all on public.annual_leave_tiers from anon;

-- Work days (per settings, minus public holidays) between two dates, inclusive.
create function app.leave_work_days(p_from date, p_to date) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from generate_series(p_from, p_to, interval '1 day') g
  where extract(isodow from g)::smallint = any ((app.settings()).work_days)
    and not exists (select 1 from public.public_holidays h where h.holiday_date = g::date);
$$;

-- Days an employee may take of a type in a year (null = no limit).
-- Annual leave: personal override, else the service tier reached by 1 Jan of
-- that year (needs a hire date), else the type's general limit.
create function app.leave_entitlement(p_employee_id uuid, p_type public.leave_type, p_year integer)
returns integer
language sql stable security definer set search_path = '' as $$
  select case when p_type = 'ANNUAL' then coalesce(
      p.annual_leave_days,
      (select t.days from public.annual_leave_tiers t
       where p.hire_date is not null
         and t.min_years <= extract(year from age(make_date(p_year, 1, 1), p.hire_date))
       order by t.min_years desc limit 1),
      pol.annual_days)
    else pol.annual_days end
  from public.profiles p, public.leave_policies pol
  where p.id = p_employee_id and pol.leave_type = p_type;
$$;

-- Days used (pending + approved) in a calendar year.
create function app.leave_used(p_employee_id uuid, p_type public.leave_type, p_year integer)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(app.leave_work_days(greatest(l.start_date, make_date(p_year, 1, 1)),
                                          least(l.end_date, make_date(p_year, 12, 31)))), 0)::integer
  from public.leave_requests l
  where l.employee_id = p_employee_id and l.leave_type = p_type and l.status in ('PENDING', 'APPROVED')
    and l.start_date <= make_date(p_year, 12, 31) and l.end_date >= make_date(p_year, 1, 1);
$$;

-- Entitlement and usage per visible employee and active type for a year.
create function public.leave_balances(p_year integer, p_employee_id uuid default null)
returns table (employee_id uuid, leave_type public.leave_type, limit_days integer, used_days integer)
language sql stable security invoker set search_path = '' as $$
  select p.id, pol.leave_type,
         app.leave_entitlement(p.id, pol.leave_type, p_year),
         app.leave_used(p.id, pol.leave_type, p_year)
  from public.profiles p, public.leave_policies pol
  where p.role in ('staff', 'manager') and pol.is_active
    and (p_employee_id is null or p.id = p_employee_id);
$$;

revoke all on function public.leave_balances(integer, uuid) from public, anon;
grant execute on function public.leave_balances(integer, uuid) to authenticated;

create or replace function public.apply_leave(p_type public.leave_type, p_from date, p_to date, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.profiles := app.current_profile();
  pol public.leave_policies;
  r public.leave_requests;
  y integer;
  asked integer;
  used integer;
  allowed integer;
begin
  if me.id is null or not me.is_active or me.role not in ('staff', 'manager') then
    return app.fail('FORBIDDEN', 'Hanya staf dan manager boleh memohon cuti.');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    return app.fail('INVALID_DATES', 'Julat tarikh tidak sah (maksimum 2 bulan).');
  end if;
  select * into pol from public.leave_policies where leave_type = p_type;
  if pol.leave_type is null or not pol.is_active then
    return app.fail('TYPE_DISABLED', 'Jenis cuti ini tidak dibuka.');
  end if;
  if app.leave_work_days(p_from, p_to) = 0 then
    return app.fail('NO_WORK_DAYS', 'Tarikh dipilih bukan hari bekerja.');
  end if;
  if exists (select 1 from public.leave_requests l
             where l.employee_id = me.id and l.status in ('PENDING', 'APPROVED')
               and l.start_date <= p_to and l.end_date >= p_from) then
    return app.fail('OVERLAP', 'Anda sudah ada permohonan cuti pada tarikh ini.');
  end if;
  for y in extract(year from p_from)::integer .. extract(year from p_to)::integer loop
    allowed := app.leave_entitlement(me.id, p_type, y);
    continue when allowed is null;
    asked := app.leave_work_days(greatest(p_from, make_date(y, 1, 1)), least(p_to, make_date(y, 12, 31)));
    used := app.leave_used(me.id, p_type, y);
    if used + asked > allowed then
      return app.fail('LIMIT', format('Baki cuti anda untuk %s ialah %s hari, permohonan ini %s hari.',
                                      y, greatest(allowed - used, 0), asked));
    end if;
  end loop;
  insert into public.leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason)
  values (me.id, me.branch_id, p_type, p_from, p_to, nullif(trim(p_reason), ''))
  returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end;
$$;
