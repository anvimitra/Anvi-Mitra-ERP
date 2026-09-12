# Anvi Mitra ERP — Major Process Status

## Current major phase — Platform hardening & production readiness

Updated: **2026-09-12**

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
- [ ] Authenticated Super Admin create → edit → deactivate E2E
- [ ] Clean PostgreSQL migration verification
- [ ] Full offline write → reconnect → push → pull E2E
- [ ] Desktop/local-folder connector runtime
- [ ] Flutter Android build + APK artifact verification
- [ ] Unified advanced dynamic animation pass across remaining ERP screens
- [ ] Final accessibility / security / production audit

## Next logical execution order

1. **E2E platform smoke test** — create a school, edit branding/config, create branch and deactivate/reactivate it.
2. **Clean DB verification** — run every migration from an empty PostgreSQL database and verify required functions/tables/indexes.
3. **Offline E2E** — perform an allowed offline mutation, reconnect, push it, pull the server journal and verify idempotency/conflict behavior.
4. **Desktop connector** — implement the actual local-folder bridge with explicit read/write permission and retry/recovery.
5. **Mobile release verification** — analyze, build APK and verify the generated artifact.
6. **UX finish** — apply the advanced dynamic animation system consistently to the remaining ERP modules without sacrificing accessibility/performance.
7. **Production sign-off** — security, tenant isolation, backup/restore, error states, accessibility and deployment checks.

## Security invariants

- Every protected API is tenant-scoped by school_id.
- Branch-scoped users cannot cross their assigned branch.
- Teacher marks require teacher + subject + class/section + session + enrollment match.
- Offline queued protected operations are re-authorized at synchronization.
- Local computer storage is never silently accessible; explicit folder permission is required.
- Online PostgreSQL remains the authoritative source of truth.

## Completion rule

Do **not** mark Production Ready until every unchecked production/E2E item above has passed verification.
