# Anvi Mitra ERP — Major Process Status

## Implemented foundation

- Multi-school and multi-branch data model with `school_id` scoping.
- Super Admin school creation flow with school profile, app branding, primary branch and initial admin setup.
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

This is a sync-boundary safeguard; authoritative exam-result domain endpoints now also enforce their own authorization before changing result tables.

## Data model rule

Online PostgreSQL remains the source of truth. Offline/local storage is a cache/outbox and secondary storage layer. Offline data must not bypass server authorization when synchronized.

## Next domain integration rule

Teacher permission scope is now enforced in the result-view backend. The next major domain step is to apply the same scope directly to the marks-entry grid's subject/class selectors and then build the teacher assignment workflow UX.
