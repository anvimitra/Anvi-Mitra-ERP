# Anvi Mitra ERP

Multi-school, multi-branch School ERP platform with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> **Process rule:** This README is the live implementation checklist. Completed work is marked **[x]**; remaining work is marked **[ ]**. Update it only after implementation or verification.

## Current Status

**Phase:** Major implementation → School management + onboarding + access control + offline foundation  
**Architecture foundation:** Complete  
**Multi-school provisioning:** Implemented  
**School onboarding foundations:** Implemented  
**Teacher class/subject security:** Implemented  
**Offline sync foundation:** Implemented  
**Production-ready:** Not yet — authenticated end-to-end tests, full offline write/sync tests, local-PC connector runtime, Flutter release verification, UI polish and deployment checks remain.

## ERP Implementation Checklist

### 1. Core platform
- [x] Node/PostgreSQL backend foundation
- [x] GitHub Actions verification workflow
- [x] JavaScript syntax validation
- [x] SQL/schema validation automation
- [x] API runtime contract smoke test
- [ ] Final production deployment verification

### 2. Multi-school / multi-branch
- [x] School tenant isolation using `school_id`
- [x] Branch-aware model using `branch_id`
- [x] School settings / branding
- [x] Branch management API
- [x] Super Admin school list/detail APIs
- [x] Super Admin school provisioning API
- [x] Super Admin school detail/edit endpoint
- [x] Super Admin school branding update endpoint
- [x] Transactional school provisioning
- [x] Main branch creation during provisioning
- [x] School-specific mobile-app configuration
- [x] Public non-sensitive school/app branding bootstrap
- [x] Initial school administrator provisioning
- [x] First school admin account is created transactionally from Add School
- [x] Super Admin School Management UI
- [x] School branding/configuration update API
- [x] School branch creation from platform management
- [ ] Fresh PostgreSQL production migration verification
- [ ] Authenticated create → edit → deactivate smoke test

### 3. School onboarding
- [x] School name/code/profile
- [x] Logo and branding
- [x] Contact/address/website
- [x] Timezone/locale/currency
- [x] Main branch
- [x] Mobile app configuration
- [x] First school administrator
- [x] Staff/teacher/student enrollment foundations
- [x] Teacher identity creation when staff role is teacher
- [x] Student session/class/section enrollment API
- [x] Parent account and student-parent linking API
- [ ] Complete fresh-school onboarding E2E test

### 4. Teacher marks security
- [x] Teacher + subject + section + session authorization
- [x] Branch scope authorization
- [x] Student enrollment validation
- [x] Maximum-mark validation
- [x] Published-exam write lock
- [x] Batch marks authorization
- [x] Offline marks re-authorization during sync
- [x] Shared database teacher authorization helper
- [x] Teacher assignment create/list/update API
- [ ] Automated unauthorized offline-sync negative test

### 5. Offline-first Web + Mobile
- [x] Device registration foundation
- [x] Server sync journal/cursor
- [x] Conflict tracking
- [x] Web offline outbox/client foundation
- [x] Mobile notification/action routing
- [x] Server-side authorization on offline marks sync
- [ ] Connect every web write form to the outbox
- [ ] Full offline write → reconnect → push → pull test
- [ ] Conflict resolution E2E test
- [ ] Mobile local cache/outbox integration test

### 6. School PC / NAS / external storage
- [x] Local storage connector data model
- [x] Read-only/read-write permission modes
- [x] Explicit user-selected folder permission model
- [x] Local connector heartbeat/sync foundation
- [ ] Desktop/local connector runtime
- [ ] Read/write synchronization test
- [ ] Failure/retry/recovery test

### 7. Notifications / mobile
- [x] Push notification initialization foundation
- [x] Notification tap routing
- [x] Foreground notification behavior
- [x] School-branded mobile configuration
- [ ] Production Firebase configuration per school/app
- [ ] Full Android analyze/build verification
- [ ] APK artifact verification
- [ ] Offline mobile cache/outbox integration

### 8. Web UI / UX
- [x] School management screen
- [x] Add School form
- [x] School search/list/status
- [x] School configuration management
- [x] Dynamic loading/online-offline state motion on School Management
- [x] Animated cards/modals/focus states on School Management
- [ ] Unified advanced dynamic animation pass
- [ ] Mobile-responsive audit
- [ ] Loading/empty/error/success state audit
- [ ] Accessibility/keyboard audit

## Architecture

```
                     SUPER ADMIN
                          |
                   School Provisioning
                          |
               +----------v----------+
               | Central ERP API     |
               | PostgreSQL (master) |
               +----------+----------+
                          |
          +---------------+---------------+
          |               |               |
        Web ERP       Flutter App     School PC/NAS
          |               |               |
       IndexedDB       Local DB       Selected Folder
          |               |               |
          +---------------+---------------+
                          |
                      Auto Sync
```

**Primary storage:** online PostgreSQL.  
**Offline storage:** client cache + outbox.  
**Secondary storage:** explicitly permitted school PC/NAS/external folder.

### Teacher permission rule

`teacher + school + branch + academic session + class/section + subject + enrolled student` must all match before marks can be written. Offline sync performs the same authorization again.

### Local computer rule

The browser/app cannot silently read the entire computer. A local connector uses an explicitly user-selected folder with **read-only** or **read-write** permission.

## Important Docs

- `erp/docs/major-process-status.md`
- `erp/docs/erp-data-architecture.md`
- `erp/docs/offline-sync-api.md`
- `erp/docs/offline-local-storage-implementation.md`

## Next Logical Work

1. [ ] Run authenticated Super Admin school provisioning E2E test.
2. [ ] Run school → staff → teacher assignment → student enrollment E2E test.
3. [ ] Run unauthorized teacher/offline marks negative tests.
4. [ ] Complete offline push/pull/conflict verification.
5. [ ] Implement actual PC local-folder connector runtime.
6. [ ] Connect remaining web write forms to offline outbox.
7. [ ] Verify Flutter Android build and APK artifact.
8. [ ] Finish advanced dynamic animation/UI pass.
9. [ ] Final regression + deployment health checks.

## Latest Progress — 2026-09-12

- [x] Super Admin school provisioning creates the school tenant, settings/branding, main branch, mobile-app configuration and first school administrator transactionally.
- [x] Super Admin School Management UI supports school list/search, Add School, configuration editing, status and branch display with dynamic online/offline state and animated interactions.
- [x] School staff API supports school/branch-scoped staff accounts and automatically initializes teacher identity rows for teacher accounts.
- [x] Student enrollment API supports session + class + section enrollment, branch validation and parent linking.
- [x] Teacher assignment API supports teacher + session + section + subject mapping with class/branch validation and mark/attendance permissions.
- [x] Offline sync foundation includes device registration, journal/cursor, conflict tracking and local storage connector configuration.
- [x] Super Admin School Management backend completed for list/detail/create/edit/branding/branch operations.
- [x] First school administrator account is provisioned transactionally during school creation.
- [x] README checklist marked to distinguish implemented foundations from items still requiring runtime/E2E verification.

**LSKLive website remains separate and is not modified as part of this ERP work.**
