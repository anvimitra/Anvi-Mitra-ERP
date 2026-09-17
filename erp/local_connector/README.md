# Anvi Mitra ERP — Local Storage Connector

This connector runs on a school-owned Windows/Linux PC and keeps a **secondary local copy** of ERP changes.

## Important model

- PostgreSQL/cloud API is the primary source of truth.
- The connector reads the server sync journal and writes snapshots only inside `LOCAL_DATA_DIR`.
- The connector does not expose the PC filesystem to the public website.
- Access is controlled by the ERP access token and the connector's configured folder.
- If the internet is unavailable, the web/mobile client keeps its own offline cache/outbox; when online, changes are synchronized to PostgreSQL and the connector then receives the durable journal entries.

## Start

Set these environment variables:

```text
ERP_API_URL=https://your-erp-api.example.com
ERP_ACCESS_TOKEN=<ERP access token>
LOCAL_DATA_DIR=C:\\AnviMitraERP\\data
DEVICE_NAME=School Office PC
POLL_SECONDS=30
```

Then run:

```bash
node erp/local_connector/agent.js
```

Linux example:

```bash
ERP_API_URL=https://your-erp-api.example.com \
ERP_ACCESS_TOKEN='...' \
LOCAL_DATA_DIR=/srv/anvi-mitra-erp/data \
DEVICE_NAME='School Office PC' \
node erp/local_connector/agent.js
```

The first run creates `.device-key` and `.sync-cursor` inside the configured data directory. Entity snapshots are written under `entities/<entity-type>/`.

**Do not put the access token into GitHub, source files, or the local data folder.** Keep it in the machine's protected environment/service configuration.
