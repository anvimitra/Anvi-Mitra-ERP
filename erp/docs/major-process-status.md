# Anvi Mitra ERP — Major Process Status

## Implemented foundation

- Multi-school and multi-branch data model with `school_id` scoping.
- Super Admin school creation flow with school profile, app branding, primary branch and initial admin setup.
- School/branch management APIs and Super Admin web UI.
- Student enrollment workflow with session, class, section and roll-number selection.
- Offline-first sync device registration, pull/push journal, cursors, idempotency metadata and conflict tracking.
- Sync conflict administration and resolution UI/API.
- Local PC/NAS/external-drive connector configuration with read-only/read-write permission mode and heartbeat tracking.
- Web offline sync client and dashboard sync status.
- Teacher marks permission API based on teacher + subject + class/section assignment.

## Teacher marks permission APIs

`GET /api/teacher-permissions/marks?examSubjectId=<uuid>`

Returns whether the signed-in user can edit that exam subject. `super_admin`, `principal` and `admin` are school-wide administrators; teachers are checked against the database assignment helper.

`POST /api/teacher-permissions/marks/check-batch`

Accepts `{"examSubjectIds":["..."]}` and returns permission results for up to 500 exam-subject IDs.

## Data model rule

Online PostgreSQL remains the source of truth. Offline/local storage is a cache/outbox and secondary storage layer. Offline data must not bypass server authorization when synchronized.

## Next domain integration rule

Exam-result mutation endpoints should call the same permission helper before accepting teacher marks, and offline outbox adapters should route protected marks changes through those domain endpoints rather than writing authoritative result tables directly.
