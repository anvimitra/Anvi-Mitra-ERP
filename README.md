# Anvi Mitra ERP

Multi-school, multi-branch School ERP with Web + Flutter mobile clients, centralized PostgreSQL data, offline-first synchronization, school-specific branding/app configuration, and role/subject/class-level access control.

> Progress marker: [x] implementation complete · [~] verification/hardening pending · [ ] not implemented

## Current Status — 2026-09-16

**Current phase: Core implementation checkpoint → CI contract repair → E2E verification → production sign-off**

### Latest implementation checkpoint
- [x] Super Admin animated School Management UI
- [x] Add School provisioning with school branding/logo and ERP/mobile-app configuration
- [x] School list/search and active/inactive status
- [x] Super Admin school provisioning/detail/update APIs
- [x] First school administrator provisioning
- [x] **Atomic Add School onboarding: school + profile + main branch + mobile configuration + first administrator are created in one transaction**
- [x] Main branch provisioning and branch management
- [x] School tenant and branch-aware authentication
- [x] Teacher class/subject/section/session permission management
- [x] Server-side teacher marks authorization and roster filtering
- [x] Marks save + sync journal integration
- [x] Staff account + teacher profile provisioning
- [x] Student enrollment + parent linking
- [x] **School enrollment management UI connected to authenticated enrollment APIs**
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
- [x] **School Management platform routes registered for Super Admin list/create/detail/update/branding workflows**
- [x] **Latest implementation checkpoint completed (2026-09-15): Add School provisions the first administrator atomically with the school**
- [x] **Latest implementation checkpoint completed (2026-09-15): Local Storage persists the user-selected folder handle in browser IndexedDB and re-checks read/write permission before connector save**
- [x] **Latest implementation checkpoint completed (2026-09-15): Teacher Permission Management page added and routed to assignment API**
- [x] **Latest implementation checkpoint completed (2026-09-15): Timetable + period management API, schema, slot-conflict protection and timetable viewer UI added**
- [x] **Latest implementation checkpoint completed (2026-09-15): Student Enrollment page added and routed to school/branch-aware enrollment APIs**
- [x] **Latest implementation checkpoint completed (2026-09-15): Reusable browser offline-sync client added under `erp/web/assets/offline-sync.js`**
- [x] **Latest implementation checkpoint completed (2026-09-15): Sync Conflict Center UI added and routed to authenticated conflict-resolution API**
- [x] **Latest implementation checkpoint completed (2026-09-15): Staff/teacher attendance schema, branch-aware roster, bulk marking and daily reporting API added and registered in the server**
- [x] **Latest implementation checkpoint completed (2026-09-15): Offline student attendance changes are applied during synchronization with school/branch/enrollment validation**
- [x] **Latest implementation checkpoint completed (2026-09-15): Super Admin school provisioning contract now includes school profile, branding, main branch, mobile configuration and first administrator in one atomic transaction**
- [x] **Latest implementation checkpoint completed (2026-09-15): Student attendance API added with branch/session/roster scope, bulk upsert, daily reporting and server-side authorization**
- [x] **Latest implementation checkpoint completed (2026-09-15): Super Admin school branding endpoint added for secure logo update across school profile and mobile-app configuration**
- [x] **Latest implementation checkpoint completed (2026-09-15): Super Admin school status toggle and direct logo-file upload workflow connected to secure branding API**
- [x] **Latest implementation checkpoint completed (2026-09-15): Super Admin school detail now exposes direct Onboarding, Teacher Permissions and Sync Center actions.**
- [x] **Latest implementation checkpoint completed (2026-09-16): CI contract suite aligned with the split School Management route modules and migration numbering normalized.**
- [x] **Next verification checkpoint completed (2026-09-16): ERP CI contract/static verification passes after the repair checkpoint.**
- [x] **Next implementation checkpoint completed (2026-09-16): Core Fee Management API + PostgreSQL model added for fee heads, class/session structures, student invoices, payments/receipts and finance reports.**
- [x] **Next implementation checkpoint completed (2026-09-16): Fee management contract test added and server registration already wired through the optional `fees` route module.**
- [x] **Latest implementation checkpoint completed (2026-09-16): Fee installment model + invoice installment endpoints added with net-total validation.**
- [x] **Latest implementation checkpoint completed (2026-09-16): Configurable late-fee rules and invoice late-fee charging endpoint added with grace-period, percentage/daily/fixed and cap support.**
- [x] **Next implementation checkpoint completed (2026-09-16): Provider-neutral online payment intent + idempotent webhook foundation added; provider secrets remain outside PostgreSQL.**
- [x] **Latest implementation checkpoint completed (2026-09-16): Finance audit trail foundation added for immutable fee/payment business events; live provider adapter and production verification remain pending.**

### Current verification / hardening
- [~] Clean PostgreSQL migration run against an empty database
- [~] Authenticated Super Admin E2E: create → edit → branding → deactivate/reactivate → admin login → branch scope
- [~] Offline E2E: offline write → reconnect → push → pull → idempotency/conflict resolution
- [~] Local storage E2E: permissioned folder read/write → sync → recovery after disconnect
- [~] Enrollment E2E: staff → teacher → student → parent linking → class/section scope
- [x] CI/static contract verification after the latest implementation commit
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
3. The first school administrator is provisioned atomically with the school using a securely hashed password and linked to the school's main branch.
4. School administrator creates staff/teacher accounts and opens **Student Enrollment**.
5. Enrollment selects the correct branch/session/class/section and can link an existing parent.
6. School management opens **Teacher Permissions** and assigns teacher → session → class/section → subject access.
7. Teachers open **Marks Entry** and receive only the students authorized for that subject/class/session.
8. Marks are validated server-side and written to the sync journal.
9. Web/mobile/local clients synchronize through the central ERP API.
10. Concurrent offline changes appear in **Sync Conflict Center** for authorized administrators to resolve.

## Progress policy

Implementation is marked [x] when the code foundation/UI/harness is present. Integration/production verification remains [~] until automated database/device/infrastructure-backed checks pass. Contract tests and E2E harnesses must not be described as production passes until they actually execute successfully against the target infrastructure.

**README checkpoint rule:** after each completed logical implementation checkpoint, this README is updated with an [x] marker; verification items remain [~] until genuinely verified.

**LSKLive website remains separate and is not modified as part of ERP work.**

## Master ERP Roadmap & Completion Tracker

**Completion rule:** ERP is **100% complete only when every implementation item is [x] and every verification/production item is [x].**

### 1. Platform & Multi-School
- [x] Central PostgreSQL/API
- [x] Multi-school tenant isolation
- [x] Multi-branch structure
- [x] School settings/branding/logo
- [x] School-specific mobile-app configuration
- [x] Super Admin authentication
- [x] Super Admin School Management
- [x] Add School provisioning
- [x] Main branch provisioning
- [x] First school administrator provisioning
- [ ] Bulk school import
- [ ] SaaS subscription/billing

### 2. Roles & Security
- [x] Super Admin
- [x] Principal/Admin
- [x] Teacher
- [x] Student
- [x] Parent
- [x] Driver
- [x] Server-side authorization
- [x] Teacher → class → section → subject → session permissions
- [x] Teacher permission management UI
- [x] Server-side marks authorization
- [x] Enrollment/roster authorization
- [ ] MFA/2FA
- [ ] Complete security audit
- [ ] Complete audit-log coverage

### 3. People & Enrollment
- [x] Staff accounts
- [x] Teacher profiles
- [x] Student profiles
- [x] Parent profiles
- [x] Student enrollment
- [x] Parent-student linking
- [x] Enrollment management UI
- [ ] Bulk student/staff import
- [ ] Document/KYC attachments
- [ ] ID-card generation
- [ ] Student promotion/session rollover

### 4. Academics
- [x] Academic sessions
- [x] Classes
- [x] Sections
- [x] Subjects
- [x] Teacher assignments
- [x] Timetable
- [x] Period management
- [ ] Teacher substitution
- [ ] Homework/assignments
- [ ] Study material
- [ ] Academic calendar
- [ ] Syllabus/progress tracking

### 5. Attendance
- [x] Student attendance
- [x] Staff/teacher attendance
- [x] Daily/monthly reports
- [x] Leave/late/half-day
- [ ] Parent attendance view
- [ ] Attendance notifications
- [x] Offline attendance + sync
- [x] Attendance audit trail

### 6. Exams, Marks & Results
- [x] Exam foundation
- [x] Teacher marks permissions
- [x] Marks save/sync journal
- [ ] Exam scheduling
- [ ] Marks validation
- [ ] FA1
- [ ] FA2
- [ ] FA3
- [ ] Half Yearly
- [ ] Yearly
- [ ] Grades/totals
- [ ] Result processing
- [ ] Report cards
- [ ] PDF/print report cards
- [ ] Rank/position rules
- [ ] Result publishing

### 7. Fees & Finance
- [x] Fee heads/structures
- [x] Class-wise fee plans
- [x] Student fee assignment foundation
- [x] Invoice generation
- [x] Discounts/concessions foundation
- [x] **Installments**
- [x] **Late fees**
- [x] Fee collection
- [~] Online payment gateway foundation (payment intents/webhooks implemented; live provider adapter still pending)
- [x] Receipts/receipt numbering
- [x] Outstanding dues
- [x] Collection/reconciliation reports foundation
- [x] **Finance audit trail foundation**

### 8. Parent Portal & Mobile
- [ ] Parent dashboard
- [ ] Child switching
- [ ] Attendance
- [ ] Marks/results
- [ ] Homework
- [ ] Fees/receipts
- [ ] Notices
- [ ] Communication
- [ ] Profile/documents
- [x] Notification tap routing foundation
- [ ] Production Firebase configuration per school

### 9. Notifications & Communication
- [x] Push notification foundation
- [x] Notification action routing
- [ ] Fee notifications
- [ ] Attendance notifications
- [ ] Exam/result notifications
- [ ] Homework notifications
- [ ] Announcements
- [ ] Targeted role/class/section notifications
- [ ] Notification history
- [ ] Read/unread state
- [ ] Notification preferences

### 10. Dashboards & Reports
- [x] Role-aware dashboard foundation
- [ ] Super Admin analytics
- [ ] School/Principal dashboard
- [ ] Teacher dashboard
- [ ] Parent dashboard
- [ ] Student dashboard
- [ ] Attendance analytics
- [ ] Fee analytics
- [ ] Result analytics
- [x] Enrollment analytics foundation
- [ ] CSV/Excel/PDF exports
- [ ] Scheduled reports

### 11. Transport
- [ ] Vehicles
- [ ] Drivers
- [ ] Routes/stops
- [ ] Student transport assignment
- [ ] Driver mobile workflow
- [ ] Route attendance
- [ ] Transport notifications
- [ ] Transport fees

### 12. Library
- [ ] Book catalogue
- [ ] Categories/authors/publishers
- [ ] Copies/barcodes
- [ ] Issue/return
- [ ] Fines
- [ ] Library reports
- [ ] Availability/search

### 13. Inventory & Assets
- [ ] Categories/items/stock
- [ ] Purchases
- [ ] Issue/return
- [ ] Vendors
- [ ] Asset register
- [ ] Asset assignment
- [ ] Stock reports
- [ ] Low-stock alerts

### 14. HR & Payroll
- [ ] Employee master
- [ ] Staff documents
- [ ] Departments/designations
- [ ] Leave management
- [ ] Attendance integration
- [ ] Salary structures
- [ ] Payroll
- [ ] Payslips
- [ ] HR/payroll reports

### 15. Offline-First Sync
- [x] Sync database foundation
- [x] Device registration
- [x] Server change cursor
- [x] Change journal
- [x] Conflict foundation
- [x] Web cache/outbox foundation
- [x] Reconnect auto-sync foundation
- [x] Offline marks re-authorization
- [x] Reusable web offline sync client
- [x] Conflict-resolution UI
- [ ] Complete entity push/pull adapters
- [x] Offline attendance
- [ ] Offline fees/receipts
- [ ] Offline exams/marks
- [ ] Offline enrollment
- [ ] Sync monitoring/retry dashboard
- [ ] Device revoke/reset

### 16. School PC/NAS Storage
- [x] Permissioned connector model
- [x] Read-only/read-write model
- [x] Desktop connector implementation
- [x] User-selected folder permission
- [ ] Local backup/export
- [ ] Incremental file sync
- [ ] Disconnect/recovery
- [ ] Local-file conflict handling
- [x] Connector health UI
- [ ] NAS support

### 17. White-Label / School Apps
- [x] Per-school app config foundation
- [x] Per-school branding foundation
- [ ] Per-school app build pipeline
- [ ] School-specific icon/splash
- [ ] School-specific Firebase config
- [ ] School-specific Android package
- [ ] School-specific iOS bundle
- [ ] Automated release pipeline
- [ ] White-label web branding

### 18. Production Hardening
- [~] Clean database migration verification
- [~] Super Admin school onboarding E2E
- [~] Admin login/branch-scope E2E
- [~] Offline push/pull/idempotency/conflict E2E
- [~] Local storage E2E
- [~] Enrollment E2E
- [~] CI/static contract verification
- [ ] Full Android analyze/build + APK artifact verification
- [ ] Flutter integration tests
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Backup/restore drill
- [ ] Disaster recovery drill
- [ ] Load/performance test
- [ ] Monitoring/alerting
- [ ] Production deployment
- [ ] Final ERP sign-off

### Implementation Tracking Rule

After every **logical implementation checkpoint**, this README must be updated:
- implementation genuinely completed → change [ ] to [x]
- implementation exists but verification is pending → use [~]
- **do not mark production/E2E work [x] until it has actually passed against the target infrastructure.**

**LSKLive website remains separate and is not modified as part of ERP development.**
