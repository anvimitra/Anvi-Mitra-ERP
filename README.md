# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implemented/verified · [~] actively being hardened · [ ] remaining

## Current Status — 2026-09-12

**Major phase: Platform hardening → E2E verification → production readiness**

### Major milestones
- [x] Multi-school / multi-branch foundation
- [x] Super Admin school provisioning
- [x] School-specific branding and mobile-app configuration
- [x] Main branch provisioning
- [x] Initial school administrator provisioning
- [x] Staff, teacher and student onboarding foundations
- [x] Teacher class/subject/section/session marks authorization
- [x] Offline sync device/journal/cursor foundation
- [x] Conflict tracking and authorized conflict resolution foundation
- [x] Web offline cache/outbox foundation
- [x] PC/NAS/external storage permission model
- [x] Super Admin School Management UI with dynamic animation
- [x] School-branded login bootstrap
- [x] Mobile notification routing
- [x] Super Admin school detail/edit/status API alignment

## Latest Major Implementation Pass

### School lifecycle + offline architecture hardening

The platform foundation now treats a school as an isolated tenant and keeps branch scope under that tenant. Super Admin provisioning initializes the school profile/settings, main branch and mobile-app configuration together. The protected school-management API also supports school detail/profile access and lifecycle status changes.

The offline architecture is explicitly **online-first with offline continuity**:

- PostgreSQL/API remains the primary source of truth.
- Web and mobile clients use local cache/outbox while offline.
- Synchronization uses device identity and server cursors/change journals.
- Conflicts are recorded rather than silently discarded.
- PC/NAS/external storage is a secondary connector with explicit user-selected-folder permission.
- Offline operations do not bypass server-side authorization when synchronized.

### Teacher marks authorization

Teacher permissions are enforced server-side by school, branch, academic session, class/section and subject assignment. A teacher cannot gain another class or subject's marks permission simply by changing request IDs.

## Data Architecture

    SUPER ADMIN
         |
         v
    SCHOOL PROVISIONING
         |
         v
    CENTRAL ERP API + POSTGRESQL  <-- PRIMARY SOURCE OF TRUTH
       /        |         \\
      /         |          \\
    WEB      MOBILE      SCHOOL PC/NAS
     |          |             |
 IndexedDB   Local DB    Explicitly selected folder
      \\         |             /
       \\        |            /
             AUTO SYNC
                |
         CONFLICT HANDLING

### Storage policy

- Online PostgreSQL/API is primary.
- Web and mobile keep local cache/outbox for offline operation.
- School PC/NAS/external storage is secondary and requires explicit user-selected-folder permission.
- Browser/app must never silently access the entire computer filesystem.
- Offline protected operations are re-authorized when synchronized.

## Teacher Marks Security

A teacher can write marks only when server-side authorization confirms:

- same school/tenant
- assigned branch scope where applicable
- assigned academic session
- assigned class/section
- assigned subject
- target student enrollment
- valid maximum marks
- exam is still writable

Changing IDs in a client request cannot grant additional access.

## Offline-first Plan

When offline, allowed writes are stored locally in an outbox. When online again, the client pushes pending operations, pulls server changes after its sync cursor, handles conflicts, and only then advances synchronization state. High-risk records such as marks and financial transactions receive stricter validation/version checks.

Server-side foundation includes sync devices, change journal, conflict records and local-storage connector records.

## Remaining Major Work

- [~] Authenticated school create → edit → deactivate/reactivate E2E
- [~] Clean PostgreSQL migration verification
- [~] Full offline write → reconnect → push → pull/conflict E2E
- [ ] Desktop/local-folder connector runtime
- [ ] Desktop read/write sync and recovery tests
- [ ] Flutter production Firebase configuration per school app
- [ ] Full Android analyze/build and APK artifact verification
- [ ] Mobile local cache/outbox integration test
- [ ] Unified advanced dynamic animation across remaining ERP modules
- [ ] Accessibility, security, backup/restore and deployment audit

## Next Logical Execution Order

1. E2E school lifecycle + tenant isolation test.
2. Clean database migration verification.
3. Full offline synchronization E2E.
4. Desktop local-folder connector runtime.
5. Flutter APK build/artifact verification.
6. Remaining ERP UI advanced animation pass.
7. Final production security/accessibility/deployment sign-off.

**Production Ready will not be marked until every remaining E2E/production item passes verification.**

**LSKLive website remains separate and is not modified as part of ERP work.**
