# Anvi Mitra ERP — Major Process Status

## Current major phase — Platform hardening & production readiness

Updated: **2026-09-13**

- [x] Multi-school / multi-branch foundation
- [x] Super Admin school provisioning
- [x] School-specific branding and app configuration
- [x] Staff / teacher / student onboarding foundations
- [x] Teacher class + subject + section + session marks authorization
- [x] Offline sync device / journal / cursor foundation
- [x] Sync conflict tracking and authorized conflict resolution
- [x] Web offline outbox foundation
- [x] School PC/NAS/external storage permission model
- [x] Super Admin School Management UI
- [x] School-branded dynamic login
- [x] Mobile notification routing
- [x] Authenticated Super Admin E2E harness
- [x] Desktop/local-folder connector runtime
- [~] Clean PostgreSQL migration verification
- [~] Full offline write → reconnect → push → pull E2E
- [~] Desktop/local-folder read/write sync and recovery E2E
- [~] Staff/teacher/student enrollment E2E
- [~] Unified advanced dynamic animation pass across remaining ERP screens
- [ ] Production Firebase configuration per published school app
- [ ] Flutter Android build + APK artifact verification
- [ ] Final accessibility / security / backup-restore audit
- [ ] Production deployment/sign-off

## Major implementation checkpoint

**[x] School platform implementation checkpoint completed.**

The repository now contains the implementation/harness for multi-school provisioning, school-specific branding/app configuration, first-admin onboarding, branch-aware authentication, staff/student onboarding foundations, teacher assignment-based marks authorization, offline sync journal/cursors/idempotency/conflicts, web offline outbox, and permissioned local-storage integration.

**[~] Infrastructure-backed verification remains open.** A harness existing in source code is not the same as a successful clean-DB/device/production run.

## Next logical execution order

1. **Clean PostgreSQL gate** — execute every migration from an empty database and verify schema/functions/indexes.
2. **Platform E2E gate** — create a school, verify first-admin login and branch scope, edit branding, deactivate/reactivate and verify public bootstrap behavior.
3. **Enrollment E2E gate** — provision staff/teacher, enroll students/parents, assign teacher permissions and verify roster isolation.
4. **Offline E2E gate** — queue allowed offline mutations, reconnect, push, pull, verify idempotency and resolve a conflict.
5. **Desktop connector gate** — exercise explicit read/write folder permission, sync, retry and recovery.
6. **Mobile release gate** — Flutter analyze, APK build and artifact verification.
7. **UX/a11y/security gate** — finish dynamic animation consistently, then audit accessibility, tenant isolation, authorization, backup/restore and production deployment.

## Security invariants

- Every protected API is tenant-scoped by `school_id`.
- Branch-scoped users cannot cross their assigned branch.
- Teacher marks require teacher + subject + class/section + session + enrollment match.
- Offline queued protected operations are re-authorized at synchronization.
- Local computer storage is never silently accessible; explicit folder permission is required.
- Online PostgreSQL remains the authoritative source of truth.

## Completion rule

Do **not** mark Production Ready until every unchecked production/E2E item above has passed verification.
