# Offline Sync API

The ERP uses online PostgreSQL as the source of truth while clients maintain a local cache and outbox.

## Device registration
`POST /api/sync/device`

```json
{"deviceKey":"stable-device-id","deviceName":"Office PC","platform":"web"}
```

## Pull server changes
`POST /api/sync/pull`

```json
{"deviceKey":"stable-device-id","cursor":0,"limit":200}
```

The response returns ordered changes and `nextCursor`. Store that cursor locally only after the batch has been applied successfully.

## Push offline changes
`POST /api/sync/push`

```json
{"deviceKey":"stable-device-id","changes":[{"entityType":"attendance","entityId":"...","operation":"update","payload":{"status":"present"}}]}
```

The API validates the device and records changes in the school's sync journal. Domain-specific APIs remain responsible for enforcing role and teacher/class/subject permissions before mutating protected data.

## Important
Offline mode must never bypass server authorization. A future domain sync adapter should translate approved outbox records into normal ERP domain mutations and create conflict rows when the local and server versions cannot be reconciled automatically.
