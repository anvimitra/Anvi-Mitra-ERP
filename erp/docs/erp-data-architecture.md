# Anvi Mitra ERP — data, offline and access architecture

## 1. One ERP, many schools

The ERP is multi-school from the foundation. Every school is isolated by `school_id`; branches add a second scope with `branch_id`. The existing schema already has schools, school settings, branches and per-school mobile-app configuration. cite-placeholder

Super Admin creates a school from the platform UI. School provisioning creates:
- school record and unique school code
- school profile/settings (display name, logo, colors, address, contact, website, timezone, locale and currency)
- main branch
- mobile app configuration (app name/slug, package IDs, API URL, logo/colors and support contact)

After provisioning, the school operates its own staff, teacher, parent and student enrollment inside that tenant.

## 2. Storage priority

**Primary:** online PostgreSQL/API. This is the authoritative copy used for cross-device consistency, reports, fees, exams and audit history.

**Secondary:** school computer / NAS / external-drive storage. A desktop connector can be granted read-only or read-write access to a user-selected folder. The browser must receive explicit folder permission from the user; the server must never get unrestricted access to the user's computer filesystem.

The local connector is for resilience/backup and synchronization, not a replacement for the online source of truth.

## 3. Offline-first behavior

Web and mobile clients keep a local cache plus an outbound operation queue (outbox). When offline:
1. reads come from the local cache;
2. allowed writes are saved locally and added to the outbox;
3. the UI shows an offline/pending-sync state;
4. no data is silently discarded.

When connectivity returns, the client pushes pending operations, receives server changes after its last cursor, resolves conflicts according to entity rules, and advances its sync cursor only after successful processing.

The backend provides `sync_devices`, `sync_changes`, `sync_conflicts` and `local_storage_connectors` as the server-side foundation for this flow.

## 4. Teacher marks security

Teacher permissions are assignment-based, not merely UI-based. A teacher assignment binds teacher + subject + section + academic session, with branch scope where applicable.

For marks entry, the server must verify all of the following:
- authenticated user is a teacher;
- teacher belongs to the same school;
- teacher has an assignment for the requested subject;
- assignment session matches the exam session;
- assigned section's class matches the exam subject class;
- branch scope matches when branches are used;
- target student is actively enrolled in that class/session;
- marks do not exceed the configured maximum.

Therefore a teacher cannot submit marks for another class or another subject by changing IDs in the request. The existing exam marks endpoint already performs this server-side assignment check, and the database migration also adds `teacher_can_edit_exam_subject()` for shared authorization logic.

## 5. Web + mobile + local PC

All three clients use the same authenticated API and tenant/security rules:

`Web ERP` ↔ `Central API/PostgreSQL` ↔ `Flutter School App`

`School PC/NAS` ↔ `Local Storage Connector` ↔ `Central API/Sync`

The local PC connector is explicitly permissioned and can be enabled per school/device. Mobile devices use their own local database/cache; the web app uses browser-managed local storage/IndexedDB. Both participate in the same sync protocol.

## 6. Conflict policy

Each sync operation carries entity identity and a server cursor. Normal non-overlapping changes merge automatically. When two devices change the same record concurrently, the server records a conflict instead of silently losing data. High-risk records such as marks, fee receipts and financial transactions should use stricter validation/version checks and require explicit resolution where needed.

## 7. Important security rule

Offline support must not bypass permissions. The local cache may make previously-authorized data available offline, but every operation sent to the server is re-authorized. A teacher's offline marks queue is accepted only if the teacher still has permission for that class/subject/session when synchronization occurs.
