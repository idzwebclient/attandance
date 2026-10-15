-- Separate break limit for Fridays (e.g. 2 hours for Friday prayers).
-- Null means Fridays use the normal break_max_minutes.
alter table public.system_settings
  add column friday_break_max_minutes integer check (friday_break_max_minutes > 0);

-- Recalculate every derived field on an attendance day from its timestamps.
create or replace function app.recompute_day(p_day_id uuid) returns public.attendance_days
language plpgsql security definer set search_path = '' as $$
declare
  s public.system_settings := app.settings();
  d public.attendance_days;
  start_min integer := app.time_minute(s.work_start_time);
  end_min integer := app.time_minute(s.work_end_time);
  in_min integer;
  out_min integer;
begin
  select * into d from public.attendance_days where id = p_day_id for update;

  d.arrival_status := null;
  d.early_arrival_minutes := 0;
  d.late_minutes := 0;
  if d.work_in_at is not null then
    in_min := app.local_minute(d.work_in_at, s.timezone);
    d.early_arrival_minutes := greatest(0, start_min - in_min);
    d.late_minutes := greatest(0, in_min - start_min);
    d.arrival_status := case
      when in_min < start_min then 'EARLY'
      when in_min = start_min then 'ON_TIME'
      else 'LATE'
    end;
  end if;

  d.break_duration_minutes := null;
  d.excess_break_minutes := 0;
  d.break_status := case
    when d.break_out_at is null and d.work_out_at is not null then 'NO_BREAK'
    when d.break_out_at is null then null
    when d.break_in_at is null then 'INCOMPLETE'
  end::public.break_status;
  if d.break_out_at is not null and d.break_in_at is not null then
    d.break_duration_minutes := floor(extract(epoch from d.break_in_at - d.break_out_at) / 60)::integer;
    d.excess_break_minutes := greatest(0, d.break_duration_minutes - case
      when extract(isodow from d.attendance_date) = 5 then coalesce(s.friday_break_max_minutes, s.break_max_minutes)
      else s.break_max_minutes
    end);
    d.break_status := case when d.excess_break_minutes > 0 then 'BREAK_EXCEEDED' else 'WITHIN_LIMIT' end;
  end if;

  d.early_departure_minutes := 0;
  if d.work_out_at is null then
    d.departure_status := case when d.work_in_at is null then null else 'NOT_PUNCHED_OUT' end;
  else
    out_min := app.local_minute(d.work_out_at, s.timezone);
    d.early_departure_minutes := greatest(0, end_min - out_min);
    d.departure_status := case when out_min < end_min then 'EARLY_DEPARTURE' else 'COMPLETE' end;
  end if;

  d.completion_status := case
    when d.work_out_at is not null then 'COMPLETED'
    when d.break_in_at is not null then 'RETURNED_FROM_BREAK'
    when d.break_out_at is not null then 'ON_BREAK'
    when d.work_in_at is not null then 'WORKING'
    else 'NOT_STARTED'
  end;

  update public.attendance_days set
    arrival_status = d.arrival_status,
    early_arrival_minutes = d.early_arrival_minutes,
    late_minutes = d.late_minutes,
    break_status = d.break_status,
    break_duration_minutes = d.break_duration_minutes,
    excess_break_minutes = d.excess_break_minutes,
    departure_status = d.departure_status,
    early_departure_minutes = d.early_departure_minutes,
    completion_status = d.completion_status
  where id = p_day_id
  returning * into d;

  return d;
end;
$$;
