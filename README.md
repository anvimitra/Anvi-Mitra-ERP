# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> **Progress marker:** `[x]` implemented/verified · `[~]` actively being hardened · `[ ]` remaining

## Current Status — 2026-09-12

**Major phase:** Platform hardening → E2E verification → production readiness

- [x] Architecture + multi-school foundation
- [x] Super Admin school provisioning + school-specific branding
- [x] Staff/teacher/student enrollment foundations
- [x] Teacher class/subject/section/session marks authorization
- [x] Offline sync foundation + conflict management
- [x] Web offline outbox foundation
- [x] School PC/NAS/external storage permission model
- [x] Super Admin School Management UI + dynamic animation pass
- [x] School-branded login bootstrap
- [x] Mobile notification routing
- [~] End-to-end platform hardening
- [~] Clean PostgreSQL migration verification
- [~] Full offline push/pull/conflict verification
- [ ] Desktop/local-folder connector runtime
- [ ] Flutter Android release/APK verification
- [ ] Unified advanced dynamic animation pass across remaining ERP screens
- [ ] Final security/accessibility/deployment audit

## Confirmed Requirements

- [x] One ERP supports multiple schools with strict `school_id` isolation.
- [x] Super Admin can provision school profile, logo, branding, contacts, branch and app configuration.
- [x] Each school keeps its own name/branding/app identity.
- [x] Online PostgreSQL/API is primary source of truth.
- [x] Web/mobile offline cache + outbox foundation exists.
- [x] Secondary PC/NAS/external-folder storage uses explicit permission modes.
- [x] Teacher marks are restricted to assigned school/branch/session/class/section/subject/enrolled students.
- [x] Offline queued protected operations are re-authorized at sync.

## Major Implementation Roadmap

### 1. Platform & School Management
- [x] School tenant model
- [x] Branch model
- [x] School settings/branding
- [x] Super Admin school list/detail/create/edit/status APIs
- [x] Transactional school provisioning
- [x] Main branch creation
- [x] School-specific mobile-app configuration
- [x] Initial school administrator provisioning
- [x] Super Admin School Management UI
- [~] Authenticated create → edit → deactivate/reactivate E2E
- [~] Fresh PostgreSQL migration verification

### 2. School Onboarding
- [x] Staff account foundations
- [x] Teacher identity creation
- [x] Teacher assignment APIs
- [x] Student enrollment by session/class/section
- [x] Parent/student linking
- [~] Complete fresh-school onboarding E2E

### 3. Teacher Marks Security
- [x] Teacher + subject + section + session authorization
- [x] Branch scope
- [x] Student enrollment validation
- [x] Maximum marks validation
- [x] Published-exam write lock
- [x] Batch authorization
- [x] Offline marks re-authorization
- [x] Database authorization helper
- [ ] Automated unauthorized offline-sync negative test

### 4. Offline-first Web + Mobile
- [x] Device registration
- [x] Server sync journal/cursor
- [x] Idempotency metadata
- [x] Conflict tracking
- [x] Conflict resolution API
- [x] Web offline outbox foundation
- [x] Notification/action routing
- [~] Connect every web write form to outbox
- [~] Full offline write → reconnect → push → pull E2E
- [~] Conflict-resolution E2E
- [ ] Mobile local cache/outbox integration test

### 5. School PC / NAS / External Storage
- [x] Connector data model
- [x] Read-only/read-write modes
- [x] Explicit user-selected folder model
- [x] Heartbeat/sync foundation
- [ ] Desktop/local connector runtime
- [ ] Read/write synchronization test
- [ ] Failure/retry/recovery test

### 6. Flutter Mobile Release
- [x] School-specific app configuration
- [x] Push initialization foundation
- [x] Notification tap routing
- [x] Foreground notification behavior
- [ ] Production Firebase configuration per school app
- [ ] Full Android analyze/build verification
- [ ] APK artifact verification
- [ ] Offline mobile cache/outbox verification

### 7. UI / UX
- [x] Super Admin School Management UI
- [x] Animated cards/modals/focus states
- [x] Dynamic online/offline state motion
- [x] Advanced animation pass on School Management
- [x] School-branded login
- [x] Responsive base layout
- [ ] Unified advanced dynamic animation across remaining modules
- [ ] Loading/empty/error/success state audit
- [ ] Accessibility/keyboard audit

## Data Architecture

```text
                    SUPER ADMIN
                         │
                         ▼
              SCHOOL PROVISIONING
                         │
                         ▼
             CENTRAL ERP API + DB
              PostgreSQL = PRIMARY
                 /       |       \
                /        |        \
              WEB      MOBILE    SCHOOL PC/NAS
               │          │          │
           IndexedDB   Local DB   Selected Folder
               \          |          /
                \         |         /
                     AUTO SYNC
                         │
                  CONFLICT HANDLING
```

### Security invariants

1. Protected API access is tenant-scoped by `school_id`.
2. Branch-scoped users cannot cross assigned branches.
3. Teacher marks require teacher + school + branch + session + class/section + subject + enrolled student match.
4. Offline protected operations are authorized again when synchronized.
5. Browser/app cannot silently read the entire computer; local folder access is explicitly granted.
6. PostgreSQL remains authoritative; local data is cache/outbox/secondary storage.

## Current Major-Process Marker

Detailed status is maintained in `erp/docs/major-process-status.md`.

**Next execution order:**
1. Authenticated school lifecycle E2E.
2. Clean DB migration verification.
3. Offline write/reconnect/push/pull/conflict E2E.
4. Desktop local-folder connector runtime.
5. Flutter APK build/artifact verification.
6. Remaining ERP screens advanced dynamic animation pass.
7. Final production audit and sign-off.

**LSKLive website remains separate and is not modified as part of ERP work.**
