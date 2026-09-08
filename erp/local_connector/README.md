# Anvi Mitra ERP — Local Storage Connector

This small Node.js agent gives the school PC a **controlled read/write folder** for secondary ERP storage. It is intentionally bound to `127.0.0.1` and never exposes the whole computer filesystem.

## How it works

- `LOCAL_STORAGE_ROOT` defines the only folder the connector can access.
- `/list` lists files/directories inside that root.
- `/read` reads a UTF-8 file inside that root.
- `/write` creates or replaces a UTF-8 file inside that root.
- `x-local-connector-token` is required for local file operations.
- Path traversal outside the configured root is rejected.
- `/sync/register`, `/sync/push` and `/sync/pull` bridge the local agent to the central ERP sync API.
- Remote sync is disabled unless `ERP_API_URL`, `ERP_ACCESS_TOKEN` and `SYNC_DEVICE_KEY` are configured locally.
- The online ERP/PostgreSQL remains the primary source of truth; this connector is a secondary local-storage layer.

## Windows example

```powershell
cd erp\local_connector
npm install
$env:LOCAL_STORAGE_ROOT='D:\AnviMitraERPData'
$env:LOCAL_CONNECTOR_TOKEN='CHANGE_THIS_TO_A_LONG_RANDOM_TOKEN'
$env:ERP_API_URL='https://your-erp-domain.example.com'
$env:ERP_ACCESS_TOKEN='SET_LOCALLY_DO_NOT_COMMIT'
$env:SYNC_DEVICE_KEY='THIS-PC-UNIQUE-KEY'
$env:LOCAL_CONNECTOR_NAME='School Office PC'
npm start
```

The service listens only on `http://127.0.0.1:43800` by default.

## Linux example

```bash
cd erp/local_connector
npm install
export LOCAL_STORAGE_ROOT=/srv/anvi-mitra-data
export LOCAL_CONNECTOR_TOKEN='CHANGE_THIS_TO_A_LONG_RANDOM_TOKEN'
export ERP_API_URL='https://your-erp-domain.example.com'
export ERP_ACCESS_TOKEN='SET_LOCALLY_DO_NOT_COMMIT'
export SYNC_DEVICE_KEY='THIS-PC-UNIQUE-KEY'
export LOCAL_CONNECTOR_NAME='School Office PC'
npm start
```

## Important security rules

- Do not point `LOCAL_STORAGE_ROOT` at `C:\`, `/`, a user profile, or another broad filesystem root. Use a dedicated ERP data directory.
- Do not commit `ERP_ACCESS_TOKEN` or `LOCAL_CONNECTOR_TOKEN` to Git.
- The connector is not a replacement for OS permissions, backups, or the primary online database.
- Remote sync writes go through the central ERP sync API; the connector does not get direct PostgreSQL credentials.
