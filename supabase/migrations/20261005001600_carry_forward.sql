-- Carry forward of unused annual leave: up to carry_forward_max_days move to
-- the next year and must be used on dates before carry_forward_month/day of
-- that year, otherwise they lapse. Carried days are used first.

alter table public.system_settings
  add column carry_forward_max_days integer not null default 5 check (carry_forward_max_days >= 0),
  add column carry_forward_month smallint not null default 3 check (carry_forward_month between 1 and 12),
  add column carry_forward_day smallint not null default 1 check (carry_forward_day between 1 and 31);

-- First day carried leave can no longer be used in a year.
create function app.carry_expiry(p_year integer) returns date
language sql stable security definer set search_path = '' as $$
  select (make_date(p_year, s.carry_forward_month, 1) + (s.carry_forward_day - 1))::date from app.settings() s;
$$;

-- Days used (pending + approved) of a type on dates in [p_from, p_to].
create function app.leave_used_between(p_employee_id uuid, p_type public.leave_type, p_from date, p_to date)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(app.leave_work_days(greatest(l.start_date, p_from), least(l.end_date, p_to))), 0)::integer
  from public.leave_requests l
  where l.employee_id = p_employee_id and l.leave_type = p_type and l.status in ('PENDING', 'APPROVED')
    and l.start_date <= p_to and l.end_date >= p_from and p_from <= p_to;
$$;

-- Annual leave carried into p_year, worked out year by year from the start
-- of service (at most 10 years back).
create function app.annual_carry_in(p_employee_id uuid, p_year integer) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.system_settings := app.settings();
  start_year integer;
  carry integer := 0;
  ent integer;
  used_all integer;
  used_before integer;
  yy integer;
begin
  select extract(year from coalesce(p.probation_end_date, p.hire_date))::integer into start_year
  from public.profiles p where p.id = p_employee_id;
  if start_year is null or start_year >= p_year or s.carry_forward_max_days = 0 then
    return 0;
  end if;
  for yy in greatest(start_year, p_year - 10) .. p_year - 1 loop
    ent := app.leave_entitlement(p_employee_id, 'ANNUAL', yy);
    if ent is null then
      carry := 0;
      continue;
    end if;
    used_all := app.leave_used(p_employee_id, 'ANNUAL', yy);
    used_before := app.leave_used_between(p_employee_id, 'ANNUAL', make_date(yy, 1, 1), app.carry_expiry(yy) - 1);
    carry := least(s.carry_forward_max_days, greatest(ent - (used_all - least(carry, used_before)), 0));
  end loop;
  return carry;
end;
$$;

drop function public.leave_balances(integer, uuid);
create function public.leave_balances(p_year integer, p_employee_id uuid default null)
returns table (
  employee_id uuid,
  leave_type public.leave_type,
  limit_days integer,
  used_days integer,
  carried_days integer,
  carried_used integer,
  carry_expires date
)
language sql stable security invoker set search_path = '' as $$
  select x.id, x.leave_type, x.limit_days, x.used_days - least(x.carried, x.used_before), x.carried,
         least(x.carried, x.used_before), app.carry_expiry(p_year)
  from (
    select p.id, pol.leave_type,
           app.leave_entitlement(p.id, pol.leave_type, p_year) as limit_days,
           app.leave_used(p.id, pol.leave_type, p_year) as used_days,
           case when pol.leave_type = 'ANNUAL' then app.annual_carry_in(p.id, p_year) else 0 end as carried,
           case when pol.leave_type = 'ANNUAL'
                then app.leave_used_between(p.id, 'ANNUAL', make_date(p_year, 1, 1), app.carry_expiry(p_year) - 1)
                else 0 end as used_before
    from public.profiles p, public.leave_policies pol
    where p.role in ('staff', 'manager') and pol.is_active
      and (p_employee_id is null or p.id = p_employee_id)
  ) x;
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
  y_from date;
  y_to date;
  expiry date;
  asked integer;
  asked_before integer;
  used integer;
  used_before integer;
  allowed integer;
  carry integer;
  left_days integer;
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
  if p_type = 'ANNUAL' and me.probation_end_date is not null and p_from <= me.probation_end_date then
    return app.fail('PROBATION', format('Cuti tahunan hanya boleh dimohon selepas tamat percubaan (%s).',
                                        to_char(me.probation_end_date, 'DD/MM/YYYY')));
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
    y_from := greatest(p_from, make_date(y, 1, 1));
    y_to := least(p_to, make_date(y, 12, 31));
    asked := app.leave_work_days(y_from, y_to);
    used := app.leave_used(me.id, p_type, y);
    carry := 0;
    asked_before := 0;
    used_before := 0;
    if p_type = 'ANNUAL' then
      carry := app.annual_carry_in(me.id, y);
      expiry := app.carry_expiry(y);
      if y_from < expiry then
        asked_before := app.leave_work_days(y_from, least(y_to, expiry - 1));
      end if;
      used_before := app.leave_used_between(me.id, p_type, make_date(y, 1, 1), expiry - 1);
    end if;
    -- Carried days only cover dates before the expiry; the rest comes from this year's entitlement.
    if (used + asked) - least(carry, used_before + asked_before) > allowed then
      left_days := greatest(allowed - (used - least(carry, used_before)), 0)
                   + case when y_from < expiry then greatest(carry - used_before, 0) else 0 end;
      return app.fail('LIMIT', format('Baki cuti anda untuk %s ialah %s hari, permohonan ini %s hari.',
                                      y, left_days, asked));
    end if;
  end loop;
  insert into public.leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason)
  values (me.id, me.branch_id, p_type, p_from, p_to, nullif(trim(p_reason), ''))
  returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end;
$$;
