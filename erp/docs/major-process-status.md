# Anvi Mitra ERP — Major Process Status

## Implemented foundation

- Multi-school and multi-branch data model with `school_id` scoping.
- Super Admin school creation flow with school profile, app branding, primary branch and initial admin setup.
- Super Admin school management UI with animated responsive dashboard, search, edit and branch navigation.
- Public non-sensitive school/app branding configuration endpoint for school-specific web/mobile bootstrap.
- School/branch management APIs and Super Admin web UI.
- Student enrollment workflow with session, class, section and roll-number selection.
- School staff account management with branch scope and teacher identity initialization.
- Offline-first sync device registration, pull/push journal, cursors, idempotency metadata and conflict tracking.
- Sync conflict administration and resolution UI/API.
- Local PC/NAS/external-drive connector configuration with read-only/read-write permission mode and heartbeat tracking.
- Web offline sync client and dashboard sync status.
- Teacher marks permission API based on teacher + subject + class/section assignment.
- Offline sync journal guard for teacher exam-mark changes, so unauthorized teachers cannot use the sync transport to bypass the assignment rule.
- Authoritative exam-mark mutation API with the same teacher assignment authorization, enrollment validation, maximum-mark validation and published-exam lock.
- Teacher scope enforced in exam-result views: teachers only receive result subjects matching their assigned class/section/subject/session and `can_mark` permission.

## School provisioning

`POST /api/platform/schools`

Super Admin provisions a tenant with:
- school name/code/status
- display name and branding
- logo/contact/address/website
- timezone/locale/currency
- main branch
- app name/slug/package identifiers
- school administrator account

Provisioning is transactional: if any required part fails, the school setup is rolled back.

`GET /api/platform/schools` and `GET /api/platform/schools/:id`

Return school settings, app configuration and branches for Super Admin management.

`PATCH /api/platform/schools/:id`

Updates school, branding and app configuration.

`GET /api/public/school-config?schoolCode=...`

Returns only non-sensitive active school/app branding and bootstrap settings. It does not expose passwords, tokens or database configuration.

## Teacher marks permission APIs

`GET /api/teacher-permissions/marks?examSubjectId=<uuid>`

Returns whether the signed-in user can edit that exam subject. `super_admin`, `principal` and `admin` are school-wide administrators; teachers are checked against the database assignment helper.

`POST /api/teacher-permissions/marks/check-batch`

Accepts `{"examSubjectIds":["..."]}` and returns permission results for up to 500 exam-subject IDs.

## Authoritative marks APIs

`POST /api/exam-marks`

Creates or updates one student's mark. Before writing, the API validates school, branch, teacher assignment, exam subject, exam session, student enrollment and maximum marks. Published exams are locked.

`POST /api/exam-marks/batch`

The same authorization and validation rules are applied to every item in a batch, up to 500 marks.

Both endpoints append a protected `exam_mark` sync journal entry after the authoritative write so offline clients can reconcile safely.

## Offline sync security

`erp/sql/034_sync_teacher_marks_guard.sql` adds a database trigger on `sync_changes`. When a teacher submits an `exam_mark` / `exam_marks` sync record, the payload must contain `examSubjectId` (or `exam_subject_id`) and the same teacher + subject + class/section helper is evaluated before the journal record is accepted.

This is a sync-boundary safeguard; authoritative exam-result domain endpoints also enforce authorization before changing result tables.

## Data model rule

Online PostgreSQL remains the source of truth. Offline/local storage is a cache/outbox and secondary storage layer. Offline data must not bypass server authorization when synchronized.

## Offline/local computer rule

The browser cannot silently access a user's computer. The Local Storage Connector uses explicit browser folder permission and supports `read_only` or `read_write`. The selected local folder is secondary storage; server data remains authoritative.

## Current hardening phase

- Added GitHub Actions CI that syntax-checks every ERP Node module and verifies required web/SQL assets exist.\n- Added clean PostgreSQL 16 migration smoke testing plus runtime schema verification for required tables, the teacher authorization function and migration journal.
- School provisioning now creates the first school administrator account transactionally from the Super Admin form.
- Super Admin school management supports create, list, edit, status changes and branch navigation.
- The remaining hardening work is runtime database migration verification, end-to-end API smoke tests, and production deployment checks.
\n## Latest phase\n\n- [x] Runtime migration verification automation added to CI.\n- [ ] Runtime CI result must pass before this phase is considered production-verified.\n