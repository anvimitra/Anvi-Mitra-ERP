# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implementation complete · [~] verification/hardening pending · [ ] not implemented

## Current Status — 2026-09-14

**Current phase: Core implementation checkpoint complete → E2E verification → production hardening**

### Latest implementation checkpoint
- [x] Super Admin animated School Management UI
- [x] Add School provisioning with school branding/logo and ERP/mobile-app configuration
- [x] School list/search and active/inactive status
- [x] Super Admin school provisioning/detail/update APIs
- [x] First school administrator provisioning
- [x] Main branch provisioning and branch management
- [x] School tenant and branch-aware authentication
- [x] Teacher class/subject/section/session permission management
- [x] Server-side teacher marks authorization and roster filtering
- [x] Marks save + sync journal integration
- [x] Staff account + teacher profile provisioning
- [x] Student enrollment + parent linking
- [x] Offline sync schema, device registration, push/pull, idempotency and conflict foundation
- [x] Web IndexedDB cache + outbox + reconnect auto-sync
- [x] Permissioned local storage connector model/runtime/UI
- [x] Mobile notification routing
- [x] Unified ERP animation foundation
- [x] Migration/preflight and architecture contract gates
- [x] Super Admin School Management UI connected to the provisioning API
- [x] **Core multi-school ERP implementation checkpoint completed**
- [x] **School onboarding provisions school profile, branding, main branch, mobile configuration and first administrator**
- [x] **School Manager supports authenticated role gate, search, status dashboard, online/offline indicator, provisioning and detail/edit workflow**
- [x] **Offline sync cursor semantics hardened: push does not advance the applied-server cursor; pull is acknowledged after local application**
- [x] **Teacher offline marks are re-authorized server-side during synchronization**

### Current verification / hardening
- [~] Clean PostgreSQL migration run against an empty database
- [~] Authenticated Super Admin E2E: create → edit → branding → deactivate/reactivate → admin login → branch scope
- [~] Offline E2E: offline write → reconnect → push → pull → idempotency/conflict resolution
- [~] Local storage E2E: permissioned folder read/write → sync → recovery after disconnect
- [~] Enrollment E2E: staff → teacher → student → parent linking → class/section scope
- [~] CI/static contract verification after the latest implementation commit
- [ ] Production Firebase configuration for each published school app
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
3. The first school administrator is provisioned with a securely hashed password and linked to the school's main branch.
4. School administrator creates staff/teacher accounts and enrolls students/parents.
5. Teachers receive class/subject/section/session assignments.
6. Teachers open **Marks Entry** and receive only the students authorized for that subject/class/session.
7. Marks are validated server-side and written to the sync journal.
8. Web/mobile/local clients synchronize through the central ERP API.

## Progress policy

Implementation is marked [x] when the code foundation/UI/harness is present. Integration/production verification remains [~] until automated database/device/infrastructure-backed checks pass. Contract tests and E2E harnesses must not be described as production passes until they actually execute successfully against the target infrastructure.

**README checkpoint rule:** after each completed logical implementation checkpoint, this README is updated with an [x] marker; verification items remain [~] until genuinely verified.

**LSKLive website remains separate and is not modified as part of ERP work.**
