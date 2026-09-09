# Anvi Mitra ERP — PC/NAS Local Storage Connector

The online PostgreSQL database remains the source of truth. The local connector provides a controlled secondary copy on a school PC, NAS folder, or external drive.

## What it does

- Registers the PC as an ERP sync device.
- Pulls server-side sync changes and stores them under `LOCAL_STORAGE_PATH/sync/`.
- Reads JSON changes placed in `LOCAL_STORAGE_PATH/outbox/` and pushes them back through the ERP sync API.
- Sends connector heartbeats so the ERP can show the last successful sync and last error.
- Uses the connector's `read_only` / `read_write` configuration for local-storage policy.

## Run on the school computer

Set environment variables without committing them to Git:

```text
ERP_API_URL=https://your-erp-api.example.com
ERP_ACCESS_TOKEN=<school-admin-token>
ERP_DEVICE_KEY=<stable-pc-device-key>
ERP_CONNECTOR_ID=<connector-id-from-erp>
LOCAL_STORAGE_PATH=D:\\AnviMitraERP
SYNC_INTERVAL_MS=15000
```

Then:

```bash
cd erp/local_connector
node agent.js
```

The connector creates:

```text
D:\\AnviMitraERP\\sync\\
D:\\AnviMitraERP\\outbox\\
```

Do not put passwords, Firebase private keys, GitHub tokens, or database credentials in this directory or in Git.

## Safety model

- The PC is a **secondary storage connector**, not the primary database.
- A local copy must never bypass ERP role/branch/teacher permissions.
- Online synchronization is authenticated with the ERP API token.
- The connector only writes inside `LOCAL_STORAGE_PATH`.
- `delete` replay is intentionally not performed by the local agent; destructive changes stay controlled by the online ERP.
