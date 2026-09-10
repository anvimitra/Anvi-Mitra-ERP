# Next ERP implementation

Completed in the current phase:
- Super Admin school onboarding UI at `/erp/web/super-admin-schools.html`.
- Multi-school / multi-branch onboarding with school profile, logo, app identity, main branch and initial admin.
- Offline sync API for device registration, pull/push, idempotent client changes and conflict tracking.
- Permission-aware offline replay for attendance, teacher marks, admissions and enrollments; the server re-checks school, branch, enrollment and teacher permissions when changes reconnect.
- Local connector remains restricted to its configured folder and reaches the central ERP only through authenticated sync APIs.
- Flutter offline cache/outbox is connected to the sync API and automatic retry flow.
- Web ERP now has an offline outbox, cached GET fallback, automatic sync on reconnect and a service worker for the ERP web shell.
- Added explicit auditable conflict-resolution API: pending conflicts can be inspected and resolved as `server_wins`, `local_wins` or `merged`; every resolution is permission-checked, writes a server-authoritative sync change and records an audit entry.
- Added the web Sync Conflict Center UI for reviewing local/server payloads and applying a resolution.
- Connected the Flutter offline queue to refresh and resolve server conflicts.
- Backend CI applies all PostgreSQL migrations before integration tests.
- Sync resolution remains server-authoritative; offline/local data cannot bypass school, branch or role permissions.
- Teacher assignment APIs now expose class context and filter teacher users to their own assignments.
- Teacher marks API now requires the exact assigned `subjectId` for both read and write, preventing a teacher from targeting another subject in the same class/exam.
- Added the teacher marks workspace at `/erp/web/teacher-marks.html`, using only server-returned teacher assignments and preserving offline queue/replay behavior.
- Added the student enrollment backend workspace API with branch/session/class/section validation, student create-or-update enrollment, parent-account creation, parent linking, and sync journaling.
- Parent listing now exposes the linked parent user ID and staff can create parent login accounts from the enrollment flow.

Next major implementation: connect the student enrollment UI to these new endpoints, add enrollment editing/parent-link management to the existing admissions/student screens, and then run backend CI with migrations + integration tests before moving to fee assignment automation.
