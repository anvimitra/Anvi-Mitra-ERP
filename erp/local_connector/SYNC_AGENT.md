# Local Storage Auto-Sync Agent

`sync-agent.js` is the second half of the local-storage phase. It keeps a dedicated ERP data folder synchronized with the central ERP sync API.

## Data layout

The agent only manages JSON records below:

```text
<LOCAL_STORAGE_ROOT>/
  data/
    students/<uuid>.json
    attendance/<uuid>.json
    exam_marks/<uuid>.json
  .sync-agent.json
```

The central PostgreSQL database remains the source of truth. Local files are a secondary copy and offline working area.

## Environment

Set these locally; never commit them:

- `LOCAL_STORAGE_ROOT` — dedicated ERP data directory.
- `ERP_API_URL` — central ERP API base URL.
- `ERP_ACCESS_TOKEN` — access token for the school/device account.
- `SYNC_DEVICE_KEY` — unique key for this PC.
- `SYNC_INTERVAL_MS` — optional polling interval, minimum 5000 ms, default 15000.

Example on Windows PowerShell:

```powershell
$env:LOCAL_STORAGE_ROOT='D:\AnviMitraERPData'
$env:ERP_API_URL='https://your-erp-domain.example.com'
$env:ERP_ACCESS_TOKEN='SET_LOCALLY_ONLY'
$env:SYNC_DEVICE_KEY='SCHOOL-OFFICE-PC-01'
node sync-agent.js
```

## Behaviour

1. Pulls central changes after the saved cursor.
2. Materializes create/update/delete changes into the local `data` tree.
3. Detects local JSON edits and pushes them through `/api/sync/push`.
4. Uses `baseCursor` so concurrent edits can become server-side conflicts instead of silently overwriting newer data.
5. Persists its cursor and file hashes in `.sync-agent.json`.
6. Keeps the local connector independent from PostgreSQL credentials.

This agent does not grant a web page unrestricted access to the PC filesystem. The existing local connector remains bound to localhost and enforces its configured storage root and local connector token.
