# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implementation complete · [~] verification/hardening pending · [ ] not implemented

## Current Status — 2026-09-12

**Current phase: Multi-school onboarding hardening → offline E2E verification → production readiness**

### Latest implementation completed
- [x] Super Admin animated School Management UI
- [x] Add School provisioning form with school branding/logo and ERP app configuration
- [x] School list/search with active/inactive counters
- [x] School detail/branch view
- [x] Super Admin school configuration edit API
- [x] School administrator provisioning during school creation
- [x] School creation changes recorded in sync journal
- [x] Offline/online connection state indicator in School Management UI
- [x] School detail GET/PATCH API alignment with the animated UI
- [x] School branding/mobile-app configuration can be edited from Super Admin API
- [x] School administrator credentials are provisioned during tenant creation

### Major implementation milestones
- [x] Multi-school / multi-branch foundation
- [x] Super Admin school provisioning API
- [x] School-specific branding and mobile-app configuration
- [x] Main branch provisioning
- [x] Initial school administrator provisioning
- [x] Staff, teacher and student onboarding foundations
- [x] Teacher class/subject/section/session marks authorization
- [x] Offline sync device/journal/cursor foundation
- [x] Conflict tracking and conflict-resolution foundation
- [x] Web offline cache/outbox foundation
- [x] PC/NAS/external storage permission model
- [x] Permissioned desktop/local-folder connector runtime
- [x] Super Admin School Management UI with dynamic animation
- [x] School-branded login bootstrap
- [x] Mobile notification routing
- [x] Super Admin school detail/edit/status API alignment

## Current logical next phase — verification/hardening

- [~] Authenticated school create → admin login → edit → deactivate/reactivate E2E
- [~] Clean PostgreSQL migration verification
- [~] Full offline write → reconnect → push → pull/conflict E2E
- [x] Desktop/local-folder connector runtime implementation
- [x] Desktop read/write safety boundary implementation
- [x] Flutter notification routing implementation
- [x] Unified ERP animation foundation
- [ ] Desktop read/write sync + recovery integration tests
- [ ] Flutter production Firebase project/configuration per published school app
- [ ] Full Android analyze/build + APK artifact verification
- [ ] Mobile local cache/outbox integration test on real device
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Backup/restore drill
- [ ] Production deployment/sign-off

## Verification rule

Implementation items are marked [x] only when the code foundation is present. Items marked [~] still need automated/infrastructure-backed E2E verification. Production Ready will not be marked until the remaining verification and deployment checks pass.

**LSKLive website remains separate and is not modified as part of ERP work.**