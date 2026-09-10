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
- Backend CI now applies all PostgreSQL migrations before integration tests.
- Added an integration test that verifies the real server uses the transactional sync routes for offline admissions.
- Corrected the offline sync integration test so it validates the API-level teacher permission boundary instead of assuming PostgreSQL RLS that is not present in the current schema.
- Transactional sync and local-storage routes are registered before legacy organization routes so the intended replay/sync handlers win when duplicate endpoints exist.

Next major implementation: add explicit, auditable conflict-resolution APIs/UI (server-wins, local-wins and merged payload review), then connect the resolution flow to the web and Flutter sync queues. Keep resolution server-authoritative and permission-checked.
