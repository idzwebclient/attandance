# Attendance Application — Full Specification

## 1. Product Overview

### 1.1 Product Type
Web-based Progressive Web Application (PWA) for employee attendance management.

### 1.2 Primary Objective
Provide a simple attendance system where employees record attendance by scanning a physical QR code located at the workplace. Every attendance submission must also be verified against the employee's current device location to confirm that the employee is physically within the permitted workplace radius.

### 1.3 Core Principles
- Simple employee experience.
- Physical QR code and location verification are mandatory for `WORK_IN` and `WORK_OUT`.
- Break attendance supports conditional QR verification based on the employee's current location.
- Location verification is mandatory for all four attendance events.
- No map interface required.
- No manual latitude or longitude entry by employees.
- Server-generated timestamps are authoritative.
- Fixed working hours: 09:00–18:00.
- Flexible break start time.
- Maximum standard break duration: 60 minutes.
- Four attendance events per employee per working day.
- Managers can monitor employees assigned to their branch.
- Administrators can manage and monitor the entire system.

---

## 2. Technology Stack

### 2.1 Application
- Next.js
- TypeScript
- Responsive web application
- Progressive Web App capability

### 2.2 Hosting
- Vercel

### 2.3 Backend and Database
- Supabase
- PostgreSQL
- Supabase Authentication
- Row Level Security (RLS)

### 2.4 Device Capabilities
- Camera access for QR scanning
- Browser Geolocation API for location verification

### 2.5 Timezone
- Default application timezone: `Asia/Kuala_Lumpur`
- All attendance calculations must use the configured company timezone.
- Database timestamps should be stored in a timezone-safe format.

---

## 3. User Roles

### 3.1 Staff
Permissions:
- Sign in.
- Scan workplace QR code.
- Submit attendance events.
- Grant device location permission.
- View own attendance status for the current day.
- View own attendance history.

Restrictions:
- Cannot manually create or edit attendance timestamps.
- Cannot manually select an attendance event type.
- Cannot view other employees' attendance.
- Cannot modify branch settings.
- Cannot modify attendance policy.

### 3.2 Manager
Permissions:
- Sign in.
- View employees assigned to the manager's branch.
- View current-day branch attendance.
- View historical branch attendance.
- View employee attendance details.
- View attendance status including late arrival, early arrival, break duration, excess break and early departure.
- View monthly attendance summaries for employees in the manager's branch.

Restrictions:
- Cannot access employees from unauthorized branches.
- Cannot change system-wide configuration unless separately granted administrator access.

### 3.3 Administrator
Permissions:
- Full system access.
- Create, update, activate and deactivate users.
- Assign roles.
- Create and manage branches.
- Assign employees and managers to branches.
- Configure branch coordinates and permitted location radius.
- Generate or regenerate physical branch QR codes.
- View attendance for all branches.
- View employee attendance history.
- View branch and company attendance summaries.
- Configure attendance policy values where supported.

---

## 4. Authentication

### 4.1 Requirements
- Every user must have an authenticated account.
- Attendance submissions must only be accepted from authenticated staff accounts.
- Authentication must be handled by Supabase Authentication.
- User role and branch assignment must be validated server-side.
- Disabled or inactive accounts must not be permitted to submit attendance.

### 4.2 Session
- Authenticated sessions may remain active according to configured authentication policy.
- Staff should not be required to sign in again for every attendance scan while the session remains valid.

---

## 5. Branch Configuration

Each branch must contain:
- Unique branch ID.
- Branch name.
- Branch status.
- Latitude.
- Longitude.
- Allowed attendance radius in metres.
- Unique QR identifier.
- Created timestamp.
- Updated timestamp.

### 5.1 Physical QR
- Each branch has a physical QR code.
- QR code is printed and physically displayed at the workplace.
- QR identifies the relevant branch or a secure branch attendance identifier.
- QR must not contain sensitive credentials.
- QR must not independently authorize attendance.
- Successful QR scanning must still require authenticated user validation and location verification.
- Administrator must be able to regenerate a branch QR identifier if required.

---

## 6. Location Verification

### 6.1 Requirement
Location verification is mandatory for all attendance events. QR requirements depend on the attendance event type and the employee's verified location.

### 6.2 Work In and Work Out Verification
For `WORK_IN` and `WORK_OUT`:
1. Employee must scan the physical branch QR.
2. Application requests the device's current location.
3. Application obtains latitude and longitude from the device.
4. Attendance request is submitted to the server.
5. Server validates the QR and identifies the branch.
6. Server retrieves the branch coordinates and allowed radius.
7. Server calculates the distance between the submitted device location and branch location.
8. Attendance is accepted only when the employee is within the permitted branch radius.

### 6.3 Break Verification
For `BREAK_OUT` and `BREAK_IN`:
1. Application requests the device's current location before determining the submission method.
2. Server calculates the employee's distance from the assigned branch.
3. If the employee is within the permitted branch radius, physical QR scanning is mandatory.
4. If the employee is outside the permitted branch radius, the event may be submitted without QR scanning.
5. A break event submitted outside the permitted branch radius must be recorded as a remote break event.
6. Remote break submission does not require manager approval.
7. The employee cannot manually select or declare whether the event is local or remote. The server determines the mode from verified location data.

### 6.4 Location Rules
- Staff must not manually enter latitude or longitude.
- No map is required in the staff interface.
- Location permission must be granted for attendance submission.
- Attendance must fail when location permission is denied.
- Attendance must fail when device location cannot be obtained.
- `WORK_IN` and `WORK_OUT` must fail when the employee is outside the permitted branch radius.
- `BREAK_OUT` and `BREAK_IN` may be accepted outside the permitted branch radius as remote break events.
- Distance validation must be performed server-side.
- Client-side validation alone must never authorize attendance.
- Location accuracy metadata should be captured when available.
- Server may reject location readings whose accuracy is outside an accepted threshold configured by the application.

---

## 7. Attendance Policy

### 7.1 Fixed Working Hours
- Work start: `09:00`
- Work end: `18:00`

### 7.2 Break Policy
- Break start time is flexible.
- Standard maximum break duration: `60 minutes`.
- No fixed break start time.
- Break duration is calculated from Break Out to Break In.

### 7.3 Daily Attendance Sequence
Each employee can have four primary attendance events per working day in the following sequence:

1. `WORK_IN`
2. `BREAK_OUT`
3. `BREAK_IN`
4. `WORK_OUT`

The system determines the next valid event automatically based on the employee's existing attendance events for the current working day.

Employees do not manually select the event type.

---

## 8. Attendance Event Rules

### 8.1 Work In
First valid attendance event of the working day.

Status calculation:
- Before 09:00: `EARLY`
- Exactly 09:00: `ON_TIME`
- After 09:00: `LATE`

Calculated values:
- Early minutes, when applicable.
- Late minutes, when applicable.

### 8.2 Break Out
Second valid attendance event of the working day.

Rules:
- Can occur at a flexible time.
- Must occur after `WORK_IN`.
- Timestamp must be recorded from the server.
- Location verification is mandatory.
- If within branch radius, physical QR scanning is mandatory.
- If outside branch radius, remote break submission is permitted without QR.
- Submission mode must be determined by the server from verified location data.

### 8.3 Break In
Third valid attendance event of the working day.

Rules:
- Must occur after `BREAK_OUT`.
- Location verification is mandatory.
- If within branch radius, physical QR scanning is mandatory.
- If outside branch radius, remote break submission is permitted without QR.
- Submission mode must be determined by the server from verified location data.
- Break duration is calculated as `BREAK_IN - BREAK_OUT`.
- Break duration of 60 minutes or less is within policy.
- Break duration greater than 60 minutes is flagged as `BREAK_EXCEEDED`.
- Excess break minutes equal `break duration - 60 minutes`.

### 8.4 Work Out
Fourth valid attendance event of the working day.

Status calculation:
- Before 18:00: `EARLY_DEPARTURE`
- At or after 18:00: `COMPLETE`

Calculated values:
- Early departure minutes, when applicable.

---

## 9. Attendance Sequence Validation

The server must enforce event order.

Valid sequence:

`WORK_IN → BREAK_OUT → BREAK_IN → WORK_OUT`

Rules:
- `BREAK_OUT` cannot exist without `WORK_IN`.
- `BREAK_IN` cannot exist without `BREAK_OUT`.
- `WORK_OUT` cannot exist without `BREAK_IN`.
- Duplicate event submission for the same stage must be rejected.
- Events cannot be reordered manually by staff.
- A completed four-event attendance day cannot accept another standard attendance event.
- All validation must occur server-side.

---

## 10. Attendance Submission Validation

Every attendance submission must validate:
- Authenticated user.
- Active user account.
- Staff role or permitted attendance role.
- Employee branch assignment.
- Current device location available.
- Valid attendance event sequence.
- No duplicate event for current stage.
- Server timestamp.

Additional validation by event type:
- `WORK_IN`: valid physical branch QR and employee within allowed branch radius.
- `BREAK_OUT`: valid physical branch QR when within branch radius; remote submission permitted when outside branch radius.
- `BREAK_IN`: valid physical branch QR when within branch radius; remote submission permitted when outside branch radius.
- `WORK_OUT`: valid physical branch QR and employee within allowed branch radius.

Attendance must not be accepted solely from values supplied by the client.
The client must not be allowed to determine whether a break event qualifies as local or remote.

---

## 11. Timestamp Rules

- Attendance timestamps must be generated or finalized by the server.
- Device clock must not be trusted as the authoritative attendance time.
- Client device time may be collected only as diagnostic metadata if required.
- Attendance calculations must use authoritative server timestamps.
- Daily attendance grouping must follow the configured company timezone.

---

## 12. Staff Application

### 12.1 Staff Dashboard
Must display:
- Employee identity.
- Current date.
- Current attendance state.
- Next required attendance action.
- Contextual attendance action based on the next required event.
- Current-day attendance events already completed.
- Current-day attendance status.

### 12.2 QR Scanner
Used when QR verification is required.

Must:
- Request camera permission.
- Scan supported branch QR codes.
- Reject invalid or unknown QR codes.
- Participate in location verification for QR-required attendance events.
- Prevent attendance completion until server validation succeeds.

### 12.3 Attendance Result
Successful attendance submission must return:
- Success state.
- Attendance event type.
- Recorded server time.
- Relevant status where applicable.

Failed attendance submission must return a clear failure state without creating an attendance event.

### 12.4 Attendance History
Staff can view:
- Date.
- Work In.
- Break Out.
- Break In.
- Work Out.
- Arrival status.
- Late minutes.
- Break duration.
- Excess break minutes.
- Departure status.
- Early departure minutes.

Staff can only access their own records.

---

## 13. Manager Application

### 13.1 Branch Dashboard
Manager dashboard must be scoped to assigned branch or branches.

Must provide:
- Current date.
- Branch name.
- Employee list.
- Current attendance state per employee.
- Work In time.
- Break Out time.
- Break In time.
- Work Out time.
- Arrival status.
- Late minutes.
- Break duration.
- Excess break minutes.
- Departure status.
- Early departure minutes.

### 13.2 Attendance Status Visibility
Manager must be able to identify:
- Employee has not punched in.
- Employee arrived early.
- Employee arrived on time.
- Employee arrived late.
- Employee is currently on break.
- Employee has returned from break.
- Employee exceeded the 60-minute break duration.
- Employee has completed the working day.
- Employee left before 18:00.
- Employee has an incomplete attendance sequence.

### 13.3 Attendance History
Manager must be able to:
- Select a date.
- View attendance for the selected date.
- View employee attendance history.
- View monthly attendance summary.

### 13.4 Monthly Summary
For each employee, monthly summary must include:
- Number of recorded attendance days.
- Number of early arrivals.
- Number of on-time arrivals.
- Number of late arrivals.
- Total late minutes.
- Number of breaks exceeding 60 minutes.
- Total excess break minutes.
- Number of early departures.
- Total early departure minutes.
- Number of completed attendance days.
- Number of incomplete attendance days.

---

## 14. Administrator Application

### 14.1 User Management
Administrator can:
- Create users.
- Edit users.
- Activate users.
- Deactivate users.
- Assign role.
- Assign branch.

### 14.2 Branch Management
Administrator can:
- Create branch.
- Edit branch.
- Activate or deactivate branch.
- Configure branch latitude.
- Configure branch longitude.
- Configure allowed radius.
- Generate physical QR code.
- Regenerate QR identifier.

### 14.3 Attendance Monitoring
Administrator can:
- View all branches.
- View all employee attendance records.
- Filter by branch.
- Filter by employee.
- Filter by date.
- Filter by month.
- View attendance status and calculated attendance metrics.

### 14.4 System Configuration
System must support configurable values for:
- Work start time.
- Work end time.
- Maximum standard break duration.
- Default location radius.
- Company timezone.

Initial configured policy:
- Work start: 09:00.
- Work end: 18:00.
- Break maximum: 60 minutes.
- Timezone: Asia/Kuala_Lumpur.

---

## 15. Data Model

### 15.1 Profiles
Required fields:
- `id`
- `auth_user_id`
- `full_name`
- `employee_code`
- `role`
- `branch_id`
- `is_active`
- `created_at`
- `updated_at`

### 15.2 Branches
Required fields:
- `id`
- `name`
- `latitude`
- `longitude`
- `allowed_radius_meters`
- `qr_identifier`
- `is_active`
- `created_at`
- `updated_at`

### 15.3 Attendance Days
Required fields:
- `id`
- `employee_id`
- `branch_id`
- `attendance_date`
- `work_in_at`
- `break_out_at`
- `break_in_at`
- `work_out_at`
- `arrival_status`
- `early_arrival_minutes`
- `late_minutes`
- `break_duration_minutes`
- `excess_break_minutes`
- `departure_status`
- `early_departure_minutes`
- `completion_status`
- `created_at`
- `updated_at`

### 15.4 Attendance Events
Required fields:
- `id`
- `attendance_day_id`
- `employee_id`
- `branch_id`
- `event_type`
- `recorded_at`
- `latitude`
- `longitude`
- `location_accuracy_meters`
- `distance_from_branch_meters`
- `qr_identifier_reference`
- `verification_mode`
- `is_remote_break`
- `created_at`

Attendance events are the immutable raw attendance records used to derive the attendance-day summary.

### 15.5 System Settings
Required fields:
- `id`
- `work_start_time`
- `work_end_time`
- `break_max_minutes`
- `default_radius_meters`
- `timezone`
- `updated_at`

---

## 16. Attendance Status Definitions

### 16.1 Arrival Status
Allowed values:
- `EARLY`
- `ON_TIME`
- `LATE`

### 16.2 Break Status
Allowed values:
- `WITHIN_LIMIT`
- `BREAK_EXCEEDED`
- `INCOMPLETE`

### 16.3 Departure Status
Allowed values:
- `EARLY_DEPARTURE`
- `COMPLETE`
- `NOT_PUNCHED_OUT`

### 16.4 Attendance Completion Status
Allowed values:
- `NOT_STARTED`
- `WORKING`
- `ON_BREAK`
- `RETURNED_FROM_BREAK`
- `COMPLETED`
- `INCOMPLETE`

---

## 17. Calculation Rules

### 17.1 Late Minutes
`max(0, WORK_IN - 09:00)`

### 17.2 Early Arrival Minutes
`max(0, 09:00 - WORK_IN)`

### 17.3 Break Duration
`BREAK_IN - BREAK_OUT`

### 17.4 Excess Break Minutes
`max(0, break_duration - 60 minutes)`

### 17.5 Early Departure Minutes
`max(0, 18:00 - WORK_OUT)`

### 17.6 Completed Day
A standard attendance day is completed when all four required events exist in the valid order.

---

## 18. Security Requirements

### 18.1 Authorization
- Use Supabase Row Level Security.
- Staff can access only their own attendance records.
- Managers can access only authorized branch records.
- Administrators can access system-wide records.

### 18.2 Attendance Integrity
- Attendance event type determined by server state.
- Server timestamp is authoritative.
- Branch QR must be validated server-side whenever QR is required.
- Employee branch assignment must be validated server-side.
- Location radius and break verification mode must be determined server-side.
- Client must not be allowed to submit arbitrary attendance event types or authoritative timestamps.

### 18.3 QR Security
- QR identifier must be non-sensitive.
- QR scan alone is insufficient to create attendance.
- QR is mandatory for `WORK_IN` and `WORK_OUT`.
- QR is mandatory for break events when the employee is within the branch radius.
- QR is not required for a break event verified outside the branch radius.
- QR identifier can be rotated by administrator.

### 18.4 Database Integrity
- Raw attendance events should be immutable to staff.
- Database constraints should prevent duplicate attendance stages where applicable.
- Critical attendance actions should be transaction-safe.

---

## 19. Location Privacy

- Location is requested only when required for an attendance action.
- Continuous background location tracking is not required.
- No employee movement tracking is required.
- Application does not require a map interface.
- Location data associated with an attendance event may be stored for verification and audit purposes.
- Access to stored attendance location data must follow role permissions.

---

## 20. Error States

System must handle:
- User not authenticated.
- User inactive.
- Camera permission denied.
- Camera unavailable.
- Invalid QR.
- QR belongs to unauthorized branch.
- Location permission denied.
- Location unavailable.
- Location accuracy unacceptable.
- Employee outside permitted radius.
- Invalid attendance sequence.
- Duplicate attendance event.
- Attendance day already completed.
- Network unavailable.
- Server/database failure.

Failed validation must not create a valid attendance event.

---

## 21. PWA Requirements

- Installable on supported mobile devices.
- Responsive mobile-first interface.
- Application icon and manifest.
- HTTPS deployment.
- Camera functionality supported through secure context.
- Geolocation functionality supported through secure context.
- Attendance submission requires successful server communication.
- Offline attendance creation is not supported in the initial scope.

---

## 22. Reporting Requirements

### 22.1 Daily Report
Must support:
- Date.
- Branch.
- Employee.
- Work In.
- Arrival status.
- Late/early minutes.
- Break Out.
- Break In.
- Break duration.
- Excess break minutes.
- Work Out.
- Departure status.
- Early departure minutes.
- Completion status.

### 22.2 Monthly Report
Must support employee-level aggregation of:
- Recorded attendance days.
- Early arrival count.
- On-time count.
- Late count.
- Total late minutes.
- Excess-break count.
- Total excess-break minutes.
- Early-departure count.
- Total early-departure minutes.
- Completed days.
- Incomplete days.

### 22.3 Scope
Reporting in the initial version is attendance reporting only.

Payroll calculations are outside the initial scope.

---

## 23. UI Requirements

### 23.1 General
- Mobile-first.
- Minimal interface.
- Large attendance scan action.
- Clear success and failure states.
- Minimal number of employee interactions.
- No employee-facing map.
- No manual coordinate fields for employees.

### 23.2 Staff Navigation
Minimum sections:
- Home / Attendance
- History
- Account / Logout

### 23.3 Manager Navigation
Minimum sections:
- Dashboard
- Attendance
- Employees
- Reports

### 23.4 Administrator Navigation
Minimum sections:
- Dashboard
- Attendance
- Employees
- Managers
- Branches
- Reports
- Settings

---

## 24. Audit Requirements

Attendance event records must retain:
- Employee.
- Branch.
- Event type.
- Server timestamp.
- Submitted coordinates.
- Location accuracy when available.
- Calculated distance from branch.
- QR reference when applicable.
- Verification mode.
- Remote break indicator.

Attendance records must be traceable to the underlying raw attendance events.

---

## 25. Performance Requirements

- Attendance submission should complete with minimal delay under normal mobile network conditions.
- QR scanning interface must be optimized for mobile devices.
- Manager daily dashboard should load branch attendance efficiently.
- Database indexes must support common filters by employee, branch and attendance date.

---

## 26. Initial Scope

The initial production scope includes:
- Authentication.
- Staff accounts.
- Manager accounts.
- Administrator accounts.
- Branch management.
- Physical QR generation and scanning.
- Mandatory QR and location verification for work arrival and work departure.
- Conditional QR verification for break events based on current location.
- Remote break submission outside the branch radius without manager approval.
- Location verification for all attendance events.
- Four-stage daily attendance sequence.
- Fixed 09:00–18:00 work policy.
- Flexible break timing.
- 60-minute break limit calculation.
- Early arrival detection.
- Late arrival detection.
- Excess break detection.
- Early departure detection.
- Staff attendance history.
- Manager branch dashboard.
- Manager attendance history.
- Monthly attendance summary.
- Administrator system management.
- PWA installation support.

---

## 27. Explicitly Out of Scope for Initial Version

The following are not part of the initial specification:
- Payroll calculation.
- Salary deduction calculation.
- Overtime calculation.
- Leave management.
- Medical leave management.
- Annual leave balances.
- Shift scheduling.
- Multiple work shifts.
- Flexible work start or end times.
- Fixed break schedules.
- Employee reason submission for lateness.
- Employee reason submission for excess break.
- Employee reason submission for early departure.
- Attendance approval workflow.
- Facial recognition.
- Selfie verification.
- NFC attendance.
- Biometric attendance.
- Dynamic QR display.
- Continuous employee GPS tracking.
- Employee-facing maps.
- Offline attendance submission.

---

## 28. Acceptance Criteria

The application is considered functionally complete for the initial scope when:

1. An administrator can create branches and configure branch coordinates and radius.
2. An administrator can create and assign users to branches and roles.
3. A physical QR can be generated for each branch.
4. An authenticated staff member can scan the physical branch QR.
5. The application can obtain the staff member's current location with permission.
6. The server can calculate the staff member's distance from the assigned branch.
7. `WORK_IN` and `WORK_OUT` require a valid physical branch QR and verified location within the permitted branch radius.
8. `WORK_IN` and `WORK_OUT` are rejected when the staff member is outside the permitted branch radius.
9. `BREAK_OUT` and `BREAK_IN` require location verification.
10. `BREAK_OUT` and `BREAK_IN` require physical QR scanning when the staff member is within the permitted branch radius.
11. `BREAK_OUT` and `BREAK_IN` can be submitted without QR when the staff member is verified outside the permitted branch radius.
12. Remote break events are identified and recorded automatically without manager approval.
13. Staff cannot manually select whether a break event is local or remote.
14. The system automatically determines the correct next attendance event.
15. A staff member can complete a maximum standard sequence of `WORK_IN → BREAK_OUT → BREAK_IN → WORK_OUT`.
16. The system records authoritative server timestamps for all four events.
17. The system correctly identifies early, on-time and late arrival relative to 09:00.
18. The system correctly calculates break duration and excess above 60 minutes.
19. The system correctly identifies departure before 18:00.
20. Staff can view their own attendance history.
21. Managers can view attendance for employees in their authorized branch.
22. Managers can view daily and monthly attendance status and summaries.
23. Administrators can view attendance across all branches.
24. Staff cannot access other employees' attendance data.
25. Managers cannot access unauthorized branch attendance data.
26. Attendance cannot be successfully created without valid authentication, required location verification, applicable QR validation and valid event sequence.
