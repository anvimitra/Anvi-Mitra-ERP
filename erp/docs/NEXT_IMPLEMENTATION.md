# Next ERP implementation

Completed in the current phase:
- Super Admin school onboarding UI at `/erp/web/super-admin-schools.html`.
- Multi-school / multi-branch onboarding with school profile, logo, app identity, main branch and initial admin.
- Offline sync API for device registration, pull/push, idempotent client changes and conflict tracking.
- Permission-aware offline replay for attendance, teacher marks, admissions and enrollments; the server re-checks school, branch, enrollment and teacher permissions when changes reconnect.
- Local connector remains restricted to its configured folder and reaches the central ERP only through authenticated sync APIs.
- Added Node built-in end-to-end HTTP coverage for sync device registration, sync status, change pull and authentication rejection.

Next major implementation: connect the offline outbox to the existing web ERP as well as Flutter, then add real PostgreSQL integration tests for replay, conflict detection and teacher-permission enforcement. Conflict resolution should remain explicit, auditable and server-authoritative.