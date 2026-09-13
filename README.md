# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implementation complete · [~] verification/hardening pending · [ ] not implemented

## Current Status — 2026-09-13

**Current phase: Major platform implementation → E2E verification → production hardening**

### Latest major implementation checkpoint
- [x] Super Admin animated School Management UI
- [x] Add School provisioning with school branding/logo and ERP/mobile-app configuration
- [x] School list/search, active/inactive state and school detail/branch management
- [x] Super Admin school configuration create/edit APIs
- [x] School detail API for branches and school administrators
- [x] School branding-specific update API
- [x] First school administrator provisioning with securely hashed password
- [x] Main branch provisioning and branch management API
- [x] School tenant and branch-aware authentication
- [x] Public school/app branding bootstrap API
- [x] Teacher marks authorization foundation (teacher + subject + class/section + session + enrollment)
- [x] Teacher class/subject/section/session permission management UI
- [x] Authorized teacher marks-entry UI with server-side roster filtering
- [x] Single + batch marks save API with authorization, enrollment and max-marks validation
- [x] Marks changes recorded in the sync journal
- [x] Teacher marks UI contract test wired into `npm test`
- [x] Offline sync schema: devices, change journal/cursors and conflicts
- [x] Offline sync push/pull/device registration and idempotency/conflict foundation
- [x] Web IndexedDB offline cache + outbox + server-change pull + device registration + reconnect auto-sync
- [x] Local storage connector model with read-only/read-write permission boundary
- [x] Permissioned desktop/local-folder connector runtime foundation
- [x] School creation changes recorded in the sync journal
- [x] ERP sync/tenant contract test wired into `npm test`
- [x] School provisioning/UI contract test wired into `npm test`
- [x] Staff account + teacher profile provisioning API
- [x] Student enrollment API: session + class/section + branch scope + parent links
- [x] Student Enrollment web workflow
- [x] Staff/student enrollment contract test wired into `npm test`
- [x] School-branded login bootstrap
- [x] Mobile notification routing
- [x] Unified ERP animation foundation
- [x] Super Admin School Management UI connected to provisioning/detail/update APIs
- [x] Super Admin school detail + branding + first-admin API integration
- [x] Migration/preflight gate added to `npm test`
- [x] Major architecture contract gate for multi-school, offline sync, local-storage permissions and teacher authorization
- [x] Authenticated Super Admin E2E harness: create → edit → branding → deactivate/reactivate → provisioned admin login → branch scope
- [x] **Major platform implementation checkpoint: school provisioning + onboarding + authorization + offline foundation**
- [x] **Major-process contract gate added to `npm test`
- [x] **README progress marker updated for the major-process checkpoint**

### Active next logical process — verification gate
- [~] **Clean PostgreSQL migration run:** execute every migration from an empty database and verify tables, indexes, functions and constraints
- [~] **Authenticated Super Admin E2E:** create school → edit → branding → deactivate/reactivate → admin login → branch scope
- [~] **Offline E2E:** offline write → reconnect → push → pull → idempotency/conflict resolution
- [~] **Local storage E2E:** permissioned folder read/write → sync → recovery after disconnect
- [~] **Enrollment E2E:** staff → teacher → student → parent linking → class/section scope
- [ ] Production Firebase configuration for each published school app
- [ ] Full Android analyze/build + APK artifact verification
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Backup/restore drill
- [ ] Production deployment/sign-off

### Progress marker
**[~] Current active work:** database-backed E2E verification and production hardening. The code foundation is marked complete, but production readiness is intentionally not marked complete until the real infrastructure-backed checks pass.

## Architecture

**Primary data:** Online PostgreSQL/API is the source of truth.

**Offline:** Web and mobile clients keep a local cache/outbox. Writes made while offline remain queued and synchronize automatically when connectivity returns. Server-side cursors, idempotency keys and conflict records prevent silent data loss.

**Secondary storage:** School PC/NAS/external-drive storage is accessed only through an explicitly permissioned local connector. The connector supports `read_only` and `read_write`; a website never receives unrestricted filesystem access.

**Security:** Tenant isolation is enforced with `school_id`, and branch-aware users are restricted by `branch_id`. Teacher marks are authorized by teacher + subject + class/section + academic session + enrollment, and the same authorization is rechecked when offline changes synchronize.

## Multi-school workflow

1. Super Admin opens **School Management → Add School**.
2. School profile, branding, main branch and mobile-app configuration are provisioned together.
3. The first school administrator is provisioned with a securely hashed password and linked to the school's main branch.
4. School administrator creates staff/teacher accounts and enrolls students/parents.
5. Teachers receive class/subject/section/session assignments.
6. Teachers open **Marks Entry** and receive only the students authorized for that subject/class/session.
7. Marks are validated server-side and written to the sync journal.
8. Web/mobile/local clients synchronize through the central ERP API.

## Progress policy

Implementation is marked [x] when the code foundation/harness is present. Integration/production verification remains [~] until automated database/device/infrastructure-backed checks pass. Contract tests and E2E harnesses must not be described as production passes until they actually execute successfully against the target infrastructure.

**LSKLive website remains separate and is not modified as part of ERP work.**
