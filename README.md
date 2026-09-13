# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implementation complete · [~] verification/hardening pending · [ ] not implemented

## Current Status — 2026-09-13

**Current phase: Multi-school administration → offline/local sync hardening**

### Latest implementation checkpoint
- [x] Super Admin animated School Management UI
- [x] Add School provisioning with school branding/logo and ERP/mobile-app configuration
- [x] School list/search, active/inactive state and school detail/branch management
- [x] Super Admin school configuration create/edit APIs
- [x] First school administrator provisioning with securely hashed password
- [x] Main branch provisioning and branch management API
- [x] School tenant and branch-aware authentication
- [x] Public school/app branding bootstrap API
- [x] Teacher marks authorization foundation (teacher + subject + class/section + session + enrollment)
- [x] Offline sync schema: devices, change journal/cursors and conflicts
- [x] Offline sync push/pull/device registration and idempotency/conflict foundation
- [x] Local storage connector model with read-only/read-write permission boundary
- [x] Permissioned desktop/local-folder connector runtime foundation
- [x] School creation changes recorded in the sync journal
- [x] ERP sync/tenant contract test wired into `npm test`
- [x] School provisioning/UI contract test wired into `npm test`
- [x] School-branded login bootstrap
- [x] Mobile notification routing
- [x] Unified ERP animation foundation
- [x] README progress checkpoint updated

### Next logical implementation queue
- [~] Finish school provisioning verification against a clean PostgreSQL database
- [~] Finish school admin onboarding verification: create → login → edit → deactivate/reactivate
- [~] Finish branch-scope verification for provisioned school administrators
- [~] Finish full offline write → reconnect → push → pull/conflict flow
- [~] Finish desktop/local-folder read/write sync and recovery flow
- [ ] Build staff/teacher/student enrollment workflow end-to-end
- [ ] Build teacher class/subject/section/session permission management UI
- [ ] Build marks-entry UI that exposes only the teacher's authorized students
- [ ] Add offline local cache/outbox integration tests on web and Flutter
- [ ] Configure production Firebase projects/configuration per published school app
- [ ] Full Android analyze/build + APK artifact verification
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Backup/restore drill
- [ ] Production deployment/sign-off

## Architecture

**Primary data:** Online PostgreSQL/API is the source of truth.

**Offline:** Web and mobile clients keep a local cache/outbox. Writes made while offline remain queued and synchronize automatically when connectivity returns. Server-side cursors, idempotency keys and conflict records prevent silent data loss.

**Secondary storage:** School PC/NAS/external-drive storage is accessed only through an explicitly permissioned local connector. The connector supports `read_only` and `read_write`; a website never receives unrestricted filesystem access.

**Security:** Tenant isolation is enforced with `school_id`, and branch-aware users are restricted by `branch_id`. Teacher marks are authorized by teacher + subject + class/section + academic session + enrollment, and the same authorization is rechecked when offline changes synchronize.

## Multi-school workflow

1. Super Admin opens **School Management → Add School**.
2. School profile, branding, main branch and mobile-app configuration are provisioned together.
3. The first school administrator is provisioned with a securely hashed password.
4. School administrator enrolls staff, teachers, students and parents.
5. Teachers receive class/subject/section/session assignments.
6. Teachers can enter marks only for their assigned class/subject scope.
7. Web/mobile/local clients synchronize through the central ERP API.

## Progress policy

Implementation is marked [x] when the code foundation is present. Integration/production verification remains [~] until automated database/device/infrastructure-backed checks pass. The contract tests are wired through `erp/package.json` as `npm test`; they should not be treated as full database/device E2E passes.

**LSKLive website remains separate and is not modified as part of ERP work.**
