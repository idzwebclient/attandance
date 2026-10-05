-- Day of the month a reporting cycle starts (e.g. 25 = 25th to 24th of next month).
-- 1 means calendar months. Capped at 28 so every month has the day.
alter table public.system_settings
  add column cycle_start_day smallint not null default 1 check (cycle_start_day between 1 and 28);
