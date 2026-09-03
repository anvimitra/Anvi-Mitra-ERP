# ERP Migration Status

## Source
The existing ERP implementation is currently under the `erp` branch of `anvimitra/LSKLive`.

## Target
This repository: `anvimitra/Anvi-Mitra-ERP`

## Migration policy
1. Preserve the existing LSKLive website.
2. Move ERP source as content into this dedicated repository.
3. Continue new ERP development here.
4. Do not move secrets, `.env` values, production database credentials, or generated build artifacts.
5. Keep school/branch isolation and exam flexibility as architectural requirements.

## Current migrated design scope
- Authentication and role checks
- Multi-school / multi-branch foundation
- Academic setup
- Admissions
- Student enrollment
- Branch-scoped people APIs
- Dashboard and web UI
- Database migration foundation

## Next migration work
Complete the source tree transfer, then run an integration pass covering API startup, database migrations, authentication, branch filtering, admissions, and web navigation before treating this repository as the canonical ERP source.
