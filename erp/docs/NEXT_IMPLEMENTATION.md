# Next ERP implementation

Completed in the current phase:
- Super Admin school onboarding UI at `/erp/web/super-admin-schools.html`.
- Multi-school / multi-branch onboarding with school profile, logo, app identity, main branch and initial admin.
- Offline sync API for device registration, pull/push, idempotent client changes and conflict tracking.
- Permission-aware offline replay for attendance, teacher marks, admissions and enrollments; the server re-checks school, branch, enrollment and teacher permissions when changes reconnect.
- Local connector remains restricted to its configured folder and reaches the central ERP only through authenticated sync APIs.
- Flutter offline cache/outbox is connected to the sync API and automatic retry flow.
- Web ERP now has an offline outbox, cached GET fallback, automatic sync on reconnect and a service worker for the ERP web shell.
- Added Node built-in HTTP coverage for sync device registration, sync status, change pull and authentication rejection.

Next major implementation: add real PostgreSQL integration tests for offline replay, conflict detection, idempotency and teacher-permission enforcement using the CI PostgreSQL service. Keep conflict resolution explicit, auditable and server-authoritative.
