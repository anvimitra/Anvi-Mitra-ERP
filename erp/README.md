# LSK Academy ERP — Phase 1

Isolated ERP foundation. The existing public LSKLive `main` branch is not modified.

## Phase 1 scope
- Backend API foundation
- PostgreSQL schema
- Secure password hashing utilities
- Role-based authentication foundation
- Health endpoint
- Multi-school ready data model

## Run locally
1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` and PostgreSQL URL.
2. `npm install`
3. `npm run dev`
4. Check `/api/health`.

Never commit real passwords, tokens, database URLs, or production secrets.
