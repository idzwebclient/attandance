-- Admin can permanently delete an employee/manager or a branch, together with
-- the attendance, leave and field-work records that belong to it. Deactivate
-- stays the everyday option; delete is for mistakes and test records.

-- Attendance events stay immutable, except inside the admin delete functions,
-- which set app.allow_delete for their own transaction.
create or replace function app.attendance_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'attendance events are immutable';
end;
$$;

-- Deletes every attendance day matching the filter, with its events, sessions and corrections.
create function app.delete_attendance_days(p_employee_id uuid, p_branch_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform set_config('app.allow_delete', 'on', true);
  delete from public.attendance_extra_sessions where employee_id = p_employee_id or branch_id = p_branch_id
    or attendance_day_id in (select id from public.attendance_days where employee_id = p_employee_id or branch_id = p_branch_id);
  delete from public.attendance_corrections
    where attendance_day_id in (select id from public.attendance_days where employee_id = p_employee_id or branch_id = p_branch_id);
  delete from public.attendance_events where employee_id = p_employee_id or branch_id = p_branch_id
    or attendance_day_id in (select id from public.attendance_days where employee_id = p_employee_id or branch_id = p_branch_id);
  delete from public.attendance_days where employee_id = p_employee_id or branch_id = p_branch_id;
  perform set_config('app.allow_delete', 'off', true);
end;
$$;

-- Returns the auth user id so the server can remove the login account afterwards.
create function public.admin_delete_employee(p_employee_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  target public.profiles;
begin
  if not app.is_admin() then
    return app.fail('FORBIDDEN', 'Hanya admin boleh memadam pekerja.');
  end if;
  select * into target from public.profiles where id = p_employee_id;
  if target.id is null then
    return app.fail('NOT_FOUND', 'Pekerja tidak dijumpai.');
  end if;
  if target.id = (app.current_profile()).id then
    return app.fail('SELF', 'Anda tidak boleh memadam akaun anda sendiri.');
  end if;
  if exists (select 1 from public.attendance_corrections c
             join public.attendance_days d on d.id = c.attendance_day_id
             where c.corrected_by = target.id and d.employee_id <> target.id) then
    return app.fail('HAS_CORRECTIONS', 'Akaun ini pernah membuat pembetulan kehadiran pekerja lain. Nyahaktifkan sahaja.');
  end if;

  perform app.delete_attendance_days(target.id, null);
  delete from public.leave_requests where employee_id = target.id;
  delete from public.field_work_permits where employee_id = target.id;
  update public.field_work_permits set created_by = null where created_by = target.id;
  delete from public.profiles where id = target.id;
  return jsonb_build_object('ok', true, 'auth_user_id', target.auth_user_id, 'role', target.role);
end;
$$;

create function public.admin_delete_branch(p_branch_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  if not app.is_admin() then
    return app.fail('FORBIDDEN', 'Hanya admin boleh memadam cawangan.');
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    return app.fail('NOT_FOUND', 'Cawangan tidak dijumpai.');
  end if;
  select count(*) into n from public.profiles where branch_id = p_branch_id;
  if n > 0 then
    return app.fail('HAS_EMPLOYEES',
      format('Cawangan ini masih ada %s pekerja/manager. Pindahkan atau padam mereka dahulu.', n));
  end if;

  perform app.delete_attendance_days(null, p_branch_id);
  update public.leave_requests set branch_id = null where branch_id = p_branch_id;
  update public.field_work_permits set branch_id = null where branch_id = p_branch_id;
  delete from public.branches where id = p_branch_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function app.delete_attendance_days(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_employee(uuid), public.admin_delete_branch(uuid) from public, anon;
grant execute on function public.admin_delete_employee(uuid), public.admin_delete_branch(uuid) to authenticated;
