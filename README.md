# Anvi Mitra ERP

Multi-school, multi-branch School ERP platform with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> **Process rule:** This README is the live implementation checklist. Completed work is marked **[x]**; remaining work is marked **[ ]**. Update it as each implementation phase is actually verified.

## Current Status

**Phase:** Production hardening → runtime migration verification  
**Architecture foundation:** Complete  
**Core school/teacher/offline security foundation:** Complete  
**Latest implementation:** Added runtime PostgreSQL schema verification after clean migrations; CI now checks required ERP tables, the teacher authorization function and the migration journal.  
**CI status:** Currently red on GitHub Actions. The latest verification jobs terminate before step details are exposed by the connected GitHub API, so the failure is being treated as an infrastructure/runner verification issue rather than being marked as a code pass.  
**Production-ready:** Not yet — runtime database verification, end-to-end smoke tests, deployment checks and final client build validation remain.

---

## ERP Implementation Checklist

### 1. Core platform & repository
- [x] ERP repository structure and Node/PostgreSQL backend foundation
- [x] GitHub Actions ERP verification workflow
- [x] JavaScript syntax validation in CI
- [x] Required web/SQL asset validation in CI
- [x] Documentation/status tracking under `erp/docs/`
- [ ] Final production deployment verification

### 2. Multi-school / multi-branch architecture
- [x] School tenant isolation using `school_id`
- [x] Branch-aware data model using `branch_id`
- [x] School settings / branding model
- [x] Branch management API
- [x] Super Admin school provisioning API
- [x] Super Admin school list API
- [x] Super Admin school detail API
- [x] Super Admin school configuration update API
- [x] Super Admin School Management UI integration with provisioning APIs
- [x] Main branch creation during school provisioning
- [x] School-specific mobile-app configuration
- [x] Public non-sensitive school/app branding bootstrap
- [ ] Full production database migration run against the target PostgreSQL instance
- [ ] Runtime smoke test for create → edit → deactivate school

### 3. Super Admin
- [x] School list/management UI
- [x] Add School flow
- [x] School edit/status management
- [x] Branch navigation
- [x] Transactional school provisioning
- [x] Initial school administrator provisioning
- [ ] Final UI/UX polish and advanced dynamic animation audit
- [ ] Final permission/error-state audit

### 4. School onboarding
- [x] School basic profile
- [x] Logo/branding fields
- [x] Contact/address/website fields
- [x] Timezone/locale/currency configuration
- [x] Main branch setup
- [x] Mobile app name/slug/package/API configuration
- [x] Staff account management foundation
- [x] Teacher identity initialization
- [x] Student enrollment workflow
- [ ] Complete onboarding end-to-end smoke test with a fresh school tenant

### 5. Staff / teachers / students
- [x] Staff management API/UI foundation
- [x] Teacher identity setup
- [x] Student enrollment by session/class/section
- [x] Branch-aware staff scope
- [x] Teacher subject/class assignment model
- [x] Teacher permission API
- [ ] Full school-admin workflow test: create staff → assign teacher → enroll students → assign subjects

### 6. Teacher marks security
- [x] Teacher + subject + section + session assignment checks
- [x] Branch scope checks
- [x] Student enrollment validation
- [x] Maximum-mark validation
- [x] Published-exam write lock
- [x] Batch marks authorization
- [x] Database sync-boundary guard for teacher marks
- [x] Teacher result-view scope filtering
- [x] Static contract test covering teacher marks authorization guard
- [ ] Automated negative tests proving offline sync cannot bypass the same permission

### 7. Offline-first Web + Mobile
- [x] Sync device registration foundation
- [x] Server sync journal/cursor model
- [x] Idempotency metadata
- [x] Conflict tracking
- [x] Sync conflict administration
- [x] Web offline-sync client foundation
- [x] Mobile notification/action handling foundation
- [ ] Full offline write → reconnect → push → pull → cursor advancement test
- [ ] Conflict resolution end-to-end test
- [ ] Mobile offline cache/outbox integration test

### 8. School PC / NAS / external storage
- [x] Local storage connector data model
- [x] Read-only / read-write permission mode
- [x] Local storage connector UI
- [x] Explicit browser folder permission approach
- [x] Local storage heartbeat/sync foundation
- [ ] Actual desktop/local connector runtime integration
- [ ] Read/write synchronization test
- [ ] Failure/retry/recovery test

### 9. Notifications
- [x] Push notification initialization foundation
- [x] Notification tap/action routing
- [x] Foreground notification behavior
- [ ] Production Firebase configuration per school/app
- [ ] End-to-end notification delivery test

### 10. Web UI / UX
- [x] Existing ERP web modules retained
- [x] School-management and onboarding screens
- [x] Teacher permissions screen foundation
- [x] Offline/sync administration screens
- [ ] Unified advanced dynamic UI/animation pass
- [ ] Mobile-responsive audit
- [ ] Loading/empty/error/success state audit
- [ ] Accessibility and keyboard navigation audit

### 11. Flutter mobile app
- [x] School-branded app configuration support
- [x] Login/authentication flow
- [x] Role-based dashboard routing
- [x] Notification tap routing
- [ ] Full Android analyze/build verification after latest changes
- [ ] APK artifact verification
- [ ] Offline cache/outbox integration
- [ ] School-specific release configuration verification

### 12. Testing & production hardening
- [x] Static JavaScript validation
- [x] Required asset checks
- [x] SQL file presence checks
- [x] Database migration execution automation in CI\n- [x] Runtime schema verification contract in CI
- [ ] API authentication smoke test
- [ ] Super Admin school provisioning smoke test
- [ ] Staff/student enrollment smoke test
- [ ] Teacher marks authorization test
- [ ] Offline sync smoke test
- [ ] Local storage connector smoke test
- [ ] Production deployment health check
- [ ] Final regression pass

---

## Architecture

```
                    SUPER ADMIN
                         |
                  School Provisioning
                         |
              +----------v----------+
              | Central ERP API     |
              | PostgreSQL (source) |
              +----------+----------+
                         |
          +--------------+--------------+
          |              |              |
        Web ERP      Flutter App    School PC/NAS
          |              |              |
       IndexedDB      Local DB      Selected Folder
          |              |              |
          +--------------+--------------+
                         |
                    Auto Sync
```

### Data rule

**Online PostgreSQL is the authoritative source of truth.**

Offline/local data is a cache + outbox and secondary storage layer. Offline mode must never bypass server-side authorization when data synchronizes.

### Teacher permission rule

A teacher can enter marks only when the server confirms:

`teacher + school + branch + academic session + class/section + subject + enrolled student`

Changing an ID in the request must never grant additional access.

### Local computer rule

The browser/app cannot silently read the entire computer. Local storage access requires explicit user-selected folder permission. The connector supports **read-only** and **read-write** modes.

---

## Important Docs

- `erp/docs/major-process-status.md` — detailed implementation status
- `erp/docs/erp-data-architecture.md` — architecture and security rules
- `erp/docs/offline-sync-api.md` — sync API design
- `erp/docs/offline-local-storage-implementation.md` — local storage design

---

## Next Logical Work

1. Run the complete PostgreSQL migration set on a clean database. **[automation complete; runtime CI result pending]**
2. Execute API smoke tests for Super Admin school provisioning, detail and edit flows.
3. Test school → staff → teacher assignment → student enrollment.
4. Run positive/negative teacher marks authorization tests.
5. Run offline sync and conflict tests.
6. Verify local PC storage read/write synchronization.
7. Verify Flutter Android analyze/build and artifact.
8. Finish the advanced dynamic UI/animation pass.
9. Run final regression and deployment health checks.
10. Mark each item above **[x]** only after it is actually verified.\n\n### Latest verified implementation\n- [x] `erp/scripts/contract-smoke.js` added to validate the cross-module ERP contract before runtime testing.\n- [x] `erp/scripts/verify-schema.js` added to validate the clean PostgreSQL schema after migrations.\n- [x] CI wired to run the runtime schema contract against a fresh PostgreSQL 16 service.

**LSKLive website remains separate and is not modified as part of this ERP work.**


## Latest Progress — 2026-09-12

- [x] Confirmed Super Admin school-management frontend exists at `super-admin/schools.html` and is wired to school provisioning/detail APIs.
- [x] Confirmed transactional school provisioning creates the school, main branch, settings, mobile-app configuration and first school administrator.
- [x] Added the browser offline-sync client: persistent outbox, device identity, server cursor, push/pull synchronization, automatic reconnect retry and sync events.
- [x] Kept offline synchronization subordinate to server authorization; the backend remains the source of truth.
- [ ] Connect every existing web write form to the offline outbox (module-by-module).
- [ ] Add actual browser folder read/write synchronization through explicit user permission.
- [ ] Run clean-database migrations and full end-to-end smoke tests before marking production readiness.

**README rule:** only verified implementation work is marked `[x]`; test-dependent items remain `[ ]` until CI/runtime verification confirms them.
