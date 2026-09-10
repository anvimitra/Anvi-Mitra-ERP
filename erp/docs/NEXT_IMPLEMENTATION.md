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

Next major implementation: build the complete staff/teacher assignment workspace so admins can assign teachers to class + subject + section + academic session, review permissions, and expose only those permitted subjects/classes in the marks-entry workflow.
