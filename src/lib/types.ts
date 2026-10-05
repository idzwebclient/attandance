export type Role = "staff" | "manager" | "admin";
export type EventType = "WORK_IN" | "BREAK_OUT" | "BREAK_IN" | "WORK_OUT" | "EXTRA_IN" | "EXTRA_OUT";
export type ArrivalStatus = "EARLY" | "ON_TIME" | "LATE";
export type BreakStatus = "WITHIN_LIMIT" | "BREAK_EXCEEDED" | "INCOMPLETE" | "NO_BREAK";
export type DepartureStatus = "EARLY_DEPARTURE" | "COMPLETE" | "NOT_PUNCHED_OUT";
export type CompletionStatus =
  | "NOT_STARTED"
  | "WORKING"
  | "ON_BREAK"
  | "RETURNED_FROM_BREAK"
  | "COMPLETED"
  | "INCOMPLETE";

export type Profile = {
  id: string;
  auth_user_id: string;
  full_name: string;
  employee_code: string;
  role: Role;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Branch = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  qr_identifier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AttendanceDay = {
  id: string;
  employee_id: string;
  branch_id: string;
  attendance_date: string;
  work_in_at: string | null;
  break_out_at: string | null;
  break_in_at: string | null;
  work_out_at: string | null;
  arrival_status: ArrivalStatus | null;
  early_arrival_minutes: number;
  late_minutes: number;
  break_status: BreakStatus | null;
  break_duration_minutes: number | null;
  excess_break_minutes: number;
  departure_status: DepartureStatus | null;
  early_departure_minutes: number;
  completion_status: CompletionStatus;
  extra_minutes: number;
  extra_open: boolean;
  is_field_work: boolean;
};

export type AttendanceDayReport = AttendanceDay & {
  effective_status: CompletionStatus;
  full_name: string;
  employee_code: string;
  branch_name: string;
};

export type Settings = {
  work_start_time: string;
  work_end_time: string;
  break_max_minutes: number;
  default_radius_meters: number;
  max_location_accuracy_meters: number;
  timezone: string;
  work_days: number[];
  cycle_start_day: number;
};

export type MonthlySummaryRow = {
  employee_id: string;
  full_name: string;
  employee_code: string;
  branch_id: string | null;
  branch_name: string | null;
  recorded_days: number;
  early_arrivals: number;
  on_time_arrivals: number;
  late_arrivals: number;
  total_late_minutes: number;
  excess_breaks: number;
  total_excess_break_minutes: number;
  early_departures: number;
  total_early_departure_minutes: number;
  completed_days: number;
  incomplete_days: number;
  absent_days: number;
  extra_sessions: number;
  total_extra_minutes: number;
  field_work_days: number;
};

export type AttendanceContext =
  | {
      ok: true;
      today: string;
      server_time: string;
      timezone: string;
      profile: { id: string; full_name: string; employee_code: string; role: Role; is_active: boolean };
      branch: { id: string; name: string } | null;
      day: AttendanceDay | null;
      completion_status: CompletionStatus;
      next_events: EventType[];
      distance_meters: number | null;
      within_radius: boolean | null;
      qr_required: Partial<Record<EventType, boolean>> | null;
      field_work: boolean;
      field_work_note: string | null;
    }
  | Failure;

export type Failure = { ok: false; code: string; message: string; next_events?: EventType[] };

export type SubmitResult =
  | {
      ok: true;
      event_type: EventType;
      recorded_at: string;
      is_remote_break: boolean;
      is_field_work?: boolean;
      distance_meters: number;
      day: AttendanceDay;
    }
  | Failure;

// A row with `missing` set is an employee with no attendance that day.
export type BoardRow = AttendanceDayReport & { missing?: boolean };
