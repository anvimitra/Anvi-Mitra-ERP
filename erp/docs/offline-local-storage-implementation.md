# Offline + Local Storage Implementation

## Data model

- PostgreSQL is the online source of truth.
- Browser/mobile clients keep an IndexedDB cache and an outbox.
- `sync_devices` identifies each client installation.
- `sync_changes` is the ordered server change log.
- `sync_conflicts` stores changes that were based on an older server cursor.
- `local_storage_connectors` records optional desktop/NAS/external-drive connectors.

## Sync lifecycle

1. Client registers its device with `POST /api/sync/device`.
2. Local writes are queued in IndexedDB when offline or when an operation is intentionally deferred.
3. When connectivity returns, the client pushes its outbox through `POST /api/sync/push`.
4. Server detects changes newer than the client's `baseCursor` for the same entity and creates a pending conflict instead of silently overwriting data.
5. Client pulls ordered changes through `GET /api/sync/changes`.
6. Pulled records are persisted into the local IndexedDB cache.
7. The client cursor advances only after the pull response is received.

## Conflict administration

Administrators can inspect all school conflicts through `GET /api/sync/admin/conflicts` and resolve a pending conflict with:

`POST /api/sync/admin/conflicts/:id/resolve`

Resolution values:

- `server_wins`
- `local_wins`
- `merged`

The current implementation records the chosen resolution. Entity-specific merge/apply logic can be added later without changing the sync transport contract.

## Local computer / NAS / external drive

The web connector uses the browser File System Access API. The browser must explicitly grant folder permission; ERP cannot silently read arbitrary computer storage.

Server-side connector metadata is available through:

- `GET /api/local-storage/connectors`
- `POST /api/local-storage/connectors`
- `PATCH /api/local-storage/connectors/:id`
- `POST /api/local-storage/connectors/:id/heartbeat`

Connector types are `desktop_folder`, `nas_folder`, and `external_drive`. Permission modes are `read_only` and `read_write`.

The local connector remains secondary storage. It must never bypass API authorization or become an alternate source of truth.

## Security boundary

Offline mode does not grant extra permissions. Server APIs remain authoritative for role, school, branch and teacher-subject access checks. Local files should be treated as recoverable copies, not trusted authorization data.
