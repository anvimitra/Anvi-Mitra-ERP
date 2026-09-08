# Next ERP implementation

Completed in the current phase:
- Super Admin school onboarding UI at `/erp/web/super-admin-schools.html`.
- Multi-school / multi-branch onboarding with school profile, logo, app identity, main branch and initial admin.
- Offline sync API for device registration, pull/push, idempotent client changes and conflict tracking.
- Permission-aware offline replay for attendance, teacher marks, admissions and enrollments; the server re-checks school, branch, enrollment and teacher permissions when changes reconnect.
- Local connector remains restricted to its configured folder and reaches the central ERP only through authenticated sync APIs.

Next major implementation: add end-to-end sync tests and then extend the same protected replay model to additional safe transactional modules. Conflict resolution should remain explicit, auditable and server-authoritative.