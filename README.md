# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> **Live implementation checklist:** `[x]` = implemented/verified, `[ ]` = remaining.

## Current Status

**Phase:** Major implementation — school management + onboarding + access control + offline-first integration

- **Architecture foundation:** Complete
- **Multi-school provisioning:** Implemented
- **School onboarding foundations:** Implemented
- **Teacher class/subject security:** Implemented
- **Offline sync foundation:** Implemented
- **Advanced School Management UI:** Implemented
- **Production-ready:** Not yet — E2E verification, fresh production migration verification, full offline sync verification, desktop connector runtime, Flutter release verification and final UI/accessibility audits remain.

## Confirmed ERP Requirements

- [x] One ERP supports multiple schools with strict school-level data isolation.
- [x] Super Admin can provision a school with profile, logo/branding, contact details, branch and app configuration.
- [x] Each school's ERP/app branding remains school-specific.
- [x] Online PostgreSQL/API is the primary source of truth.
- [x] Web and mobile clients have an offline-first sync foundation.
- [x] Secondary school-PC/NAS/external-folder storage has an explicit permission model.
- [x] Teacher marks access is restricted by school, branch, academic session, class/section, subject and student enrollment.
- [x] Offline queued marks remain subject to server-side authorization during synchronization.
- [ ] Full online/offline E2E verification before production sign-off.

## Implementation Checklist

### Core Platform
- [x] Node/PostgreSQL backend foundation
- [x] GitHub Actions verification workflow
- [x] JavaScript syntax validation
- [x] SQL/schema validation automation
- [x] API runtime smoke-test foundation
- [ ] Final production deployment verification

### Multi-school / Multi-branch
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
- [x] Super Admin School Management UI
- [x] School branding/configuration update API
- [x] School branch creation from platform management
- [ ] Fresh PostgreSQL production migration verification
- [ ] Authenticated create → edit → deactivate smoke test

### School Onboarding
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

### Teacher Marks Security
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

### Offline-first Web + Mobile
- [x] Device registration foundation
- [x] Server sync journal/cursor
- [x] Conflict tracking
- [x] Web offline outbox/client foundation
- [x] Generic Web API mutation adapter queues transport failures into the offline outbox
- [x] Mobile notification/action routing
- [x] Server-side authorization on offline marks sync
- [ ] Connect every web write form to the outbox
- [ ] Full offline write → reconnect → push → pull test
- [ ] Conflict resolution E2E test
- [ ] Mobile local cache/outbox integration test

### School PC / NAS / External Storage
- [x] Local storage connector data model
- [x] Read-only/read-write permission modes
- [x] Explicit user-selected folder permission model
- [x] Local connector heartbeat/sync foundation
- [ ] Desktop/local connector runtime
- [ ] Read/write synchronization test
- [ ] Failure/retry/recovery test

### Notifications / Mobile
- [x] Push notification initialization foundation
- [x] Notification tap routing
- [x] Foreground notification behavior
- [x] School-branded mobile configuration
- [ ] Production Firebase configuration per school/app
- [ ] Full Android analyze/build verification
- [ ] APK artifact verification
- [ ] Offline mobile cache/outbox integration

### Web UI / UX
- [x] Super Admin School Management screen
- [x] Add School form
- [x] School search/list/status
- [x] School configuration management
- [x] Dynamic loading/online-offline state motion on School Management
- [x] Animated cards/modals/focus states on School Management
- [x] Advanced dynamic animation pass on School Management
- [x] Responsive base layout
- [ ] Unified advanced dynamic animation pass across remaining ERP screens
- [ ] Loading/empty/error/success state audit
- [ ] Accessibility/keyboard audit

## Latest Implementation Marker — 2026-09-12

- [x] Super Admin school provisioning API creates school + settings + main branch + mobile-app configuration + first school administrator transactionally.
- [x] Super Admin School Management UI is implemented at `erp/web/super-admin/schools.html`.
- [x] UI is connected to authenticated school list/create/detail/edit APIs.
- [x] School Management UI has dynamic online/offline status, animated cards, modal transitions, focus states and responsive layout.
- [x] README progress tracking updated after verification.
- [ ] Authenticated Super Admin school create → edit → deactivate E2E verification.
- [ ] Fresh PostgreSQL migration verification.
- [ ] Full offline push/pull/conflict verification.
- [ ] Desktop/local-folder connector runtime.
- [ ] Flutter Android build + APK artifact verification.
- [ ] Advanced dynamic animation/UI pass across remaining ERP screens.

## Architecture

```text
SUPER ADMIN
     │
     ▼
School Provisioning → School-specific Branding/App Config
     │
     ▼
Central ERP API + PostgreSQL (PRIMARY)
     │
 ┌───┼──────────────┐
 ▼   ▼              ▼
Web Mobile       School PC/NAS
│   │              │
IndexedDB/Local DB Selected Folder
└───┼──────────────┘
    ▼
 Auto Sync + Conflict Handling
```

**Primary storage:** online PostgreSQL.

**Offline storage:** client cache + outbox.

**Secondary storage:** explicitly permitted school PC/NAS/external folder.

### Teacher permission rule

`teacher + school + branch + academic session + class/section + subject + enrolled student` must all match before marks can be written. Offline synchronization performs the authorization again.

### Local computer rule

The browser/app cannot silently read the entire computer. A local connector uses an explicitly user-selected folder with **read-only** or **read-write** permission.

## Important Docs

- `erp/docs/major-process-status.md`
- `erp/docs/erp-data-architecture.md`
- `erp/docs/offline-sync-api.md`
- `erp/docs/offline-local-storage-implementation.md`

**LSKLive website remains separate and is not modified as part of this ERP work.**
