# Anvi Mitra ERP — Phase 1

Isolated ERP foundation. The existing public LSKLive `main` branch is not modified.

## Current foundation
- Central PostgreSQL-backed multi-school / multi-branch ERP API.
- Super Admin school onboarding and school/app identity configuration.
- Role-aware dashboards and branch switching.
- Teacher class + section + subject + session permissions with server-side marks enforcement.
- Offline web cache/outbox with automatic synchronization when connectivity returns.
- Sync device registration, change cursor, conflict tracking and local-storage connector registry.
- Web local-storage page for optional read/write folder backup where the browser supports the File System Access API.
- Flutter unified school app with school-specific branding and notification actions.

All production database migrations still need to be applied and verified against the target PostgreSQL instance before production use.
