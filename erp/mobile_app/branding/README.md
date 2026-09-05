# School App Branding

This folder contains non-secret branding metadata only.

## Per-school values

- `school_slug`: stable school identifier
- `app_name`: name shown in the app
- `application_id`: unique Android package/application ID
- `artifact_name`: CI APK artifact name
- `primary_color`: six-digit hex color without `#`
- `secondary_color`: six-digit hex color without `#`
- `logo_url`: optional public HTTPS logo URL
- `firebase_project_alias`: logical Firebase project name only; never store Firebase credentials here

## Firebase rule

Do not commit `google-services.json`, service-account private keys, or other credentials to this repository.

Firebase's Android setup uses `google-services.json` for app/project configuration, and the Google services Gradle plugin processes that file during the build. The file contains project/app identifiers, but the production build should still receive school-specific Firebase configuration through the CI secret/configuration process rather than embedding credentials in source control.

## Build

The Android workflow accepts school-specific values through `workflow_dispatch`. The current defaults are for LSK Academy.

For a new school, use:

1. A unique Android application ID.
2. A unique school slug.
3. The school's brand colors.
4. The school's public logo URL, if available.
5. A separate Firebase Android app registered for the exact application ID.
6. The Firebase configuration supplied to CI through a protected secret/configuration mechanism.

The actual school logo image is intentionally not invented or committed until the school provides the approved logo asset.
