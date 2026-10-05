-- Extra work sessions after clocking out (called back to work).
-- Enum values are added in their own migration so later ones can use them.
alter type public.attendance_event_type add value if not exists 'EXTRA_IN';
alter type public.attendance_event_type add value if not exists 'EXTRA_OUT';
