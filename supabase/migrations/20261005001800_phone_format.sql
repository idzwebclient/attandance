-- One phone format for everyone, e.g. 012-345 6789, 011-2345 6789, 03-1234 5678,
-- 04-123 4567. +60 / 60 prefixes become 0. Unrecognised numbers are left as typed.
-- Mirrors formatPhone in src/lib/format.ts.
create function app.format_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then
    return null;
  end if;
  if d like '60%' and length(d) between 11 and 12 then
    d := substr(d, 2);
  end if;
  if d like '01%' and length(d) = 11 then
    return substr(d, 1, 3) || '-' || substr(d, 4, 4) || ' ' || substr(d, 8);
  elsif d like '01%' and length(d) = 10 then
    return substr(d, 1, 3) || '-' || substr(d, 4, 3) || ' ' || substr(d, 7);
  elsif d like '0%' and length(d) = 10 then
    return substr(d, 1, 2) || '-' || substr(d, 3, 4) || ' ' || substr(d, 7);
  elsif d like '0%' and length(d) = 9 then
    return substr(d, 1, 2) || '-' || substr(d, 3, 3) || ' ' || substr(d, 6);
  end if;
  return p;
end;
$$;

update public.profiles set phone = app.format_phone(phone)
where phone is not null and phone is distinct from app.format_phone(phone);

-- IC numbers: same 123456-12-1234 format (already enforced on save).
update public.profiles
set ic_number = substr(regexp_replace(ic_number, '\D', '', 'g'), 1, 6) || '-'
             || substr(regexp_replace(ic_number, '\D', '', 'g'), 7, 2) || '-'
             || substr(regexp_replace(ic_number, '\D', '', 'g'), 9)
where ic_number is not null and length(regexp_replace(ic_number, '\D', '', 'g')) = 12;
