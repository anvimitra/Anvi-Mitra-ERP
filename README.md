# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implementation complete · [~] verification/hardening pending · [ ] not implemented

## Current Status — 2026-09-13

**Current phase: Verification/hardening → production readiness**

### Latest implementation completed
- [x] Super Admin animated School Management UI
- [x] Add School provisioning form with school branding/logo and ERP app configuration
- [x] School list/search with active/inactive counters
- [x] School detail/branch view
- [x] Super Admin school configuration edit API
- [x] School administrator provisioning during school creation
- [x] School administrator credentials securely hashed before storage
- [x] School creation changes recorded in sync journal
- [x] Offline/online connection state indicator in School Management UI
- [x] School detail GET/PATCH API alignment with the animated UI
- [x] School branding/mobile-app configuration can be edited from Super Admin API
- [x] Main branch provisioning and branch management API
- [x] Offline sync schema with device registration, change journal, cursors and conflicts
- [x] Teacher marks authorization guard foundation
- [x] Offline sync push/pull/device registration API
- [x] Sync idempotency and conflict-resolution API
- [x] Local storage connector API with read-only/read-write permission model
- [x] Permissioned desktop/local-folder connector runtime
- [x] Desktop read/write safety boundary
- [x] Super Admin school-management create/edit/branding/status API flow
- [x] ERP sync/tenant contract regression test wired into npm test
- [x] Super Admin School Management UI with dynamic animation
- [x] School-branded login bootstrap
- [x] Mobile notification routing
- [x] Unified ERP animation foundation

### Verification / hardening queue
- [~] Authenticated school create → admin login → edit → deactivate/reactivate E2E (implemented; CI/database execution pending)
- [~] Provisioned administrator branch-scope E2E (implemented; CI/database execution pending)
- [~] School deactivate/reactivate and public-branding isolation E2E (implemented; CI/database execution pending)
- [~] Clean PostgreSQL migration verification
- [~] Full offline write → reconnect → push → pull/conflict E2E
- [~] Sync server API integration execution
- [ ] Desktop read/write sync + recovery integration tests
- [ ] Flutter production Firebase project/configuration per published school app
- [ ] Full Android analyze/build + APK artifact verification
- [ ] Mobile local cache/outbox integration test on real device
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Backup/restore drill
- [ ] Production deployment/sign-off

## Architecture

**Primary data:** Online PostgreSQL/API is the source of truth.

**Offline:** Web and mobile clients keep a local cache/outbox. Writes made while offline remain queued and synchronize automatically when connectivity returns. Server-side cursors, idempotency keys and conflict records prevent silent data loss.

**Secondary storage:** School PC/NAS/external-drive storage is accessed only through an explicitly permissioned local connector. The connector supports read_only and read_write; a website never receives unrestricted filesystem access.

**Security:** Tenant isolation is enforced with school_id, and branch-aware users are restricted by branch_id. Teacher marks are authorized by teacher + subject + class/section + academic session + enrollment, and the same authorization is rechecked when offline changes synchronize.

## Multi-school workflow

1. Super Admin opens School Management → Add School.
2. School profile, branding, main branch and mobile-app configuration are provisioned together.
3. The first school administrator is provisioned with a securely hashed password.
4. School administrator enrolls staff, teachers, students and parents.
5. Teachers receive class/subject/section/session assignments.
6. Teachers can enter marks only for their assigned class/subject scope.
7. Web/mobile/local clients synchronize through the central ERP API.

## Progress policy

Implementation is marked [x] when the code foundation is present. Integration/production verification remains [~] until automated database/device/infrastructure-backed checks pass.

**LSKLive website remains separate and is not modified as part of ERP work.**
