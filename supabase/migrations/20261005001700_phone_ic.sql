-- Phone number and MyKad (IC) number for every staff, manager and admin.
-- IC is stored as 123456-12-1234 and must be unique when given.
alter table public.profiles
  add column phone text check (phone ~ '^\+?[0-9 -]{8,20}$'),
  add column ic_number text unique check (ic_number ~ '^[0-9]{6}-[0-9]{2}-[0-9]{4}$');
