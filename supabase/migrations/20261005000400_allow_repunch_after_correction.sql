-- An admin correction can clear a stage (e.g. remove a wrong clock-out), after
-- which the employee must be able to punch that stage again. The day row and
-- the per-employee advisory lock already enforce the sequence, so raw events
-- no longer need to be unique per stage; they remain an append-only audit log.
alter table public.attendance_events
  drop constraint attendance_events_attendance_day_id_event_type_key;

create index attendance_events_day_idx on public.attendance_events (attendance_day_id, recorded_at);
