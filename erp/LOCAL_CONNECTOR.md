# Local Storage Connector

Run the connector on the school's trusted PC.

Environment variables:
- `ERP_API_URL` — ERP API base URL
- `ERP_ACCESS_TOKEN` — authenticated ERP token for the school
- `LOCAL_ROOT` — folder used for local ERP sync data
- `DEVICE_NAME` — optional device label
- `SYNC_INTERVAL_MS` — optional interval, minimum 15000 ms

Example:

`ERP_API_URL=https://erp.example.com ERP_ACCESS_TOKEN=... LOCAL_ROOT=D:\\AnviMitraData node erp/local_connector.js`

The connector is intentionally scoped to `LOCAL_ROOT`. It does not scan or modify arbitrary files on the PC. Server changes are written as immutable sync records under `LOCAL_ROOT/sync/` for local access/backup.
