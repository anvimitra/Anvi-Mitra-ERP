# Anvi Mitra ERP — quick deployment

## Recommended first deployment

The repository is prepared for a Node 20 web service with PostgreSQL.

### Render

1. Create a PostgreSQL database.
2. Create a Web Service from this repository.
3. Set the service root directory to `erp`.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add these environment variables:
   - `DATABASE_URL` — PostgreSQL connection string
   - `JWT_SECRET` — long random secret
   - `CORS_ORIGIN` — deployed ERP website origin
   - `NODE_ENV=production`
7. Health check: `/api/health`.

A `render.yaml` is included so these service settings are reproducible.

## Database

Run the SQL migrations in `erp/sql/` against the production PostgreSQL database in filename/order order. Do not skip migrations.

Before real school data is entered, create a database backup/snapshot.

## First login

The ERP needs an existing Super Admin account in the database. Use the project's supported seed/migration flow rather than putting a password in source control.

## Web

The Node service serves the ERP web files from `erp/web`. The default route opens the Super Admin school management page.

## Mobile

The Flutter app uses the configured API base URL. Each school can have its own branding/app configuration. Build the Android app only after the production API URL and Firebase configuration are supplied.

## Health verification

After deployment, open:

`/api/health`

Expected response includes:

`"ok": true`

and, when PostgreSQL is configured and reachable:

`"database": "ok"`.

## Important

Do not commit production passwords, JWT secrets, database credentials or Firebase private keys. Keep them in the deployment provider's secret/environment-variable store.

Offline/local-storage features remain client-side/connector features; the central PostgreSQL database remains the primary source of truth.
