-- Admin-set leave policy per type: on/off and days per calendar year
-- (null = no limit). Pending and approved requests count towards the limit;
-- only work days that are not public holidays are counted.

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

-- Work days (per settings, minus public holidays) between two dates, inclusive.
create function app.leave_work_days(p_from date, p_to date) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from generate_series(p_from, p_to, interval '1 day') g
  where extract(isodow from g)::smallint = any ((app.settings()).work_days)
    and not exists (select 1 from public.public_holidays h where h.holiday_date = g::date);
$$;

-- Days used (pending + approved) per employee and type in a calendar year.
create function public.leave_balances(p_year integer, p_employee_id uuid default null)
returns table (employee_id uuid, leave_type public.leave_type, used_days integer)
language sql stable security invoker set search_path = '' as $$
  select l.employee_id, l.leave_type,
    sum(app.leave_work_days(greatest(l.start_date, make_date(p_year, 1, 1)),
                            least(l.end_date, make_date(p_year, 12, 31))))::integer
  from public.leave_requests l
  where l.status in ('PENDING', 'APPROVED')
    and l.start_date <= make_date(p_year, 12, 31) and l.end_date >= make_date(p_year, 1, 1)
    and (p_employee_id is null or l.employee_id = p_employee_id)
  group by l.employee_id, l.leave_type;
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
  if pol.annual_days is not null then
    for y in extract(year from p_from)::integer .. extract(year from p_to)::integer loop
      asked := app.leave_work_days(greatest(p_from, make_date(y, 1, 1)), least(p_to, make_date(y, 12, 31)));
      select coalesce(sum(app.leave_work_days(greatest(l.start_date, make_date(y, 1, 1)),
                                              least(l.end_date, make_date(y, 12, 31)))), 0)
        into used
      from public.leave_requests l
      where l.employee_id = me.id and l.leave_type = p_type and l.status in ('PENDING', 'APPROVED')
        and l.start_date <= make_date(y, 12, 31) and l.end_date >= make_date(y, 1, 1);
      if used + asked > pol.annual_days then
        return app.fail('LIMIT', format('Baki cuti anda untuk %s ialah %s hari, permohonan ini %s hari.',
                                        y, greatest(pol.annual_days - used, 0), asked));
      end if;
    end loop;
  end if;
  insert into public.leave_requests (employee_id, branch_id, leave_type, start_date, end_date, reason)
  values (me.id, me.branch_id, p_type, p_from, p_to, nullif(trim(p_reason), ''))
  returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end;
$$;
