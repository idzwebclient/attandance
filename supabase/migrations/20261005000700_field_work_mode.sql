-- Verification mode for punches made away from the branch on an approved field-work day.
alter type public.verification_mode add value if not exists 'FIELD_LOCATION_ONLY';
