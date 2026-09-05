# Per-school Firebase push configuration

The push worker supports multiple Firebase projects without storing credentials in the repository.

## Preferred configuration

Set `FIREBASE_SCHOOL_CONFIG_JSON` in the server environment. It must be a JSON object keyed by the ERP `school_id` UUID.

Example shape (use real secret values only in the server secret store):

```json
{
  "school-uuid": {
    "projectId": "firebase-project-id",
    "clientEmail": "firebase-adminsdk@example.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
  }
}
```

The existing single-project variables remain supported as a fallback:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Never commit Firebase service-account JSON files, private keys, or other credentials.
