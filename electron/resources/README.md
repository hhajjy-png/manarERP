# `electron/resources/`

Files here are bundled into the packaged/installed application via `electron-builder.yml`'s
`extraResources`, resolved at runtime through `process.resourcesPath`.

## `gdrive-oauth-client.json` — one-time developer/release setup

**This is a developer/release responsibility, done once for the distributed manarERP
application — never something an end user creates, edits, or copies.**

Google Drive Sync (`electron/services/googleDriveAuth.service.ts`) needs a Google Desktop
OAuth client (Client ID + Client Secret) to run its existing system-browser OAuth2 flow.
Before running `npm run dist` for the first time (or whenever rotating the OAuth client):

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create (or
   reuse) an OAuth 2.0 Client ID of type **Desktop app**.
2. Copy `gdrive-oauth-client.example.json` in this folder to `gdrive-oauth-client.json`.
3. Fill in the real `clientId` / `clientSecret` from step 1.
4. Run `npm run dist`. `electron-builder.yml` copies this file into the installer as
   `resources/gdrive-oauth-client.json`; the packaged app resolves it via
   `process.resourcesPath` automatically — no further action per end-user install.

`gdrive-oauth-client.json` (the real one, not the `.example.json` template) is **git-ignored**
— it is a release artifact, not application source, and is never committed.

A Desktop OAuth client secret embedded in a distributed executable is not a confidential
server secret under Google's [installed-app model](https://developers.google.com/identity/protocols/oauth2/native-app)
— it identifies the *application*, not a user, and cannot by itself grant access to any
account. Treat it like any other release artifact (versioned per release, rotatable), not
like a database credential or API signing key.

## End-user experience (unaffected by any of the above)

1. Install manarERP normally.
2. Open Backup → Cloud Sync.
3. Click "ربط حساب Google" (Connect Google Account).
4. The system browser opens Google's OAuth consent screen; the user signs in and grants
   access.
5. manarERP stores the resulting OAuth tokens via the existing secure token-storage
   mechanism (`electron-safeStorage`-encrypted, per-device).

The end user never sees, creates, or copies any credentials file.
