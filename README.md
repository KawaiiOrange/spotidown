# Downtify (frontend) — forked proxy UI

This repository contains the frontend/server-side UI piece renamed to "Downtify" (this repo represents the graphical & automation part). The API used by this project is a fork of the original Spotidown service — see the "Changes from the original API" section for details.

WARNING: This project automates scraping and downloading MP3 files. Downloading copyrighted material may be illegal in your jurisdiction. Use responsibly and at your own risk.

---

## What this project is

Downtify is a Bun/TypeScript-based proxy UI and automation layer that uses a headless browser to drive the Spotidown web frontend (spotidown.app) and resolve direct MP3 download URLs for Spotify tracks. The code exposes an HTTP API for single-track downloads, ISRC lookups, playlist listing, and server-side playlist downloading with SSE progress reporting.

This repository is the forked UI/automation component — it is not the original Spotidown upstream. This API is a fork and contains changes and additions described below.

---

## Prerequisites

These are required to run Downtify successfully:

- Bun (v1.0+) — recommended runtime for direct TypeScript execution and the bundled global fetch.
- Node.js (v18+) — required if running under Node (provides global fetch and compatibility for Puppeteer and spotify-web-api-node).
- Puppeteer — headless Chromium automation used to interact with spotidown.app.
- spotify-web-api-node — used for Spotify Web API client credentials flow and metadata queries.

Notes:
- Bun is recommended because the codebase is TypeScript-first and the project references Bun-friendly tooling.
- If you run under Node, use Node 18+ to ensure the global `fetch` API exists. Otherwise, install a fetch polyfill.
- Puppeteer will download a compatible Chromium binary unless you supply a browser executable via `executablePath`.

---

## Quick overview of endpoints

- GET / -> status and endpoints listing
- GET /track/:id -> returns MP3 for Spotify track id (attachment)
- POST /track/url -> body: { url } -> returns metadata + download endpoint
- GET /track/:id/info -> track metadata (Spotify API preferred, embed fallback)
- GET /isrc/:isrc -> search Spotify for ISRC and return download
- GET /playlist/:id -> playlist metadata + tracks
- POST /playlist/download-all -> body: { url, jobId? } -> downloads tracks to `downloads/<playlist>/`
- GET /playlist/zip/progress/:jobId -> SSE progress updates for jobId

---

## What changed from the original Spotidown (API changes in this fork)

This fork modifies and extends the original Spotidown behavior to be a server-side API usable by other programs:

- Renamed the project interface to "Downtify" — this repository is the UI/automation front and acts as a proxy for the Spotidown frontend.
- Exposed a programmatic Express HTTP API (endpoints listed above) to integrate with other tools and automated workflows.
- Added server-side playlist downloading that saves MP3 files to `downloads/<sanitized-playlist-name>/` (the upstream web UI does not offer this exact server-side behavior).
- Added Server-Sent Events (SSE) for progress reporting when downloading playlists (optional `jobId` parameter and `/playlist/zip/progress/:jobId`).
- Integrated Spotify Web API client (client credentials flow) to fetch richer metadata; falls back to scraping Spotify embed pages when credentials are missing or invalid.
- Implemented ISRC search endpoint which uses the Spotify API to resolve ISRC codes to track IDs and download them.
- Improved filename sanitization and duplicate filename collision handling when saving playlists to disk.
- Periodic refresh of the Spotidown page (every 5 minutes) to help keep the Puppeteer session alive.
- Some server/user messages remain localized to Portuguese in the code — these were preserved in this fork.

If you need any of the above reverted (for parity with upstream) or implemented differently (for example zipping playlists and serving the archive), say so and I can change it.

---

## Environment variables

Create a `.env` file in the repository root and set:

- CLIENT_ID — Spotify Web API client id (recommended for metadata and ISRC search)
- CLIENT_SECRET — Spotify Web API client secret

Example:

```
CLIENT_ID=your_spotify_client_id
CLIENT_SECRET=your_spotify_client_secret
```

Notes:
- Without valid Spotify credentials the server will still try to fetch metadata using the Spotify embed fallback, but some endpoints (ISRC search, richer metadata) will be degraded.

---

## Current known issues and errors (observed in code / runtime pitfalls)

The following is a comprehensive list of current errors, limitations, and places that can fail based on the current implementation in `index.ts`:

1. Spotify credentials missing or invalid
   - Symptoms: Errors like "Spotify credentials not configured" or Spotify 401/403 responses.
   - Source: If CLIENT_ID/CLIENT_SECRET are missing or Spotify rejects credentials, the code sets an internal `spotifyApiKnownBroken` flag and returns friendly error messages.
   - Impact: Metadata endpoints and ISRC search will use fallback or fail. The server still attempts downloads via Spotidown scraping but metadata will be limited.

2. Spotify Web API rate limits / transient failures
   - Symptoms: `clientCredentialsGrant()` or `getTrack()` calls throw and metadata falls back to embed scraping.
   - Impact: Some metadata may be incomplete and extra warnings are logged. The `spotifyApiWarnedOnce` flag prevents repeated console warnings.

3. Puppeteer / Chromium launch failures
   - Symptoms: Puppeteer fails to launch headless browser; server fails to initialize and exits (see `Failed to initialize browser/page`).
   - Causes: Missing Chromium binary, insufficient permissions, container environments requiring `--no-sandbox` adjustments, or incompatible OS.
   - Mitigation: Ensure Puppeteer installed and has disk space; provide `executablePath` in `puppeteer.launch()` if necessary; run with necessary flags in containerized environments.

4. grecaptcha not loaded / reCAPTCHA execution errors
   - Symptoms: `grecaptcha not loaded` rejection inside `resolveMp3Url` when the page's grecaptcha is not available or blocked.
   - Cause: The scraping relies on the Spotidown page loading the public reCAPTCHA and the injected grecaptcha object being available in the page context. If the site changes or blocks grecaptcha, the evaluation fails.
   - Impact: Download resolution fails with errors like "grecaptcha not loaded" or generic "No download form fields found".

5. Spotidown response structure changes / invalid JSON
   - Symptoms: Errors such as "Invalid JSON from Spotidown", "No download form fields found", or "Could not find MP3 download url in Spotidown response".
   - Cause: The fork relies on the current HTML/JSON structure of Spotidown responses. If upstream changes selectors, field names, or the token sequence, the parsing code will break.
   - Impact: Track resolution fails, and downloads cannot be fetched.

6. MP3 fetch failures
   - Symptoms: `Failed to fetch mp3 (status X)` when fetching the resolved mp3 URL.
   - Cause: The resolved MP3 URL returned by Spotidown may be invalid, expired, or blocked by remote host.
   - Impact: Download fails even after successful resolution.

7. Node runtime `fetch` availability
   - Symptoms: `ReferenceError: fetch is not defined` when running under older Node versions.
   - Mitigation: Use Bun or Node v18+ which includes global fetch. Alternatively add a fetch polyfill (node-fetch) if running in older Node.

8. Hard-coded port and messages
   - Symptoms: Server listens on port 3045 only by default and logs messages in Portuguese.
   - Impact: Might conflict with existing services; you may want to make port configurable via environment variable.

9. Duplicate dependency choices
   - Observation: package.json includes both `puppeteer` and `puppeteer-core`. `puppeteer-core` is only useful if you provide your own browser binary via `executablePath`. This can be confusing.

10. Filename length & sanitization edge cases
    - Symptoms: Very long or unusual track/artist names may be truncated or sanitized unexpectedly (the code limits to 150 characters and removes reserved characters).
    - Impact: Some filenames may be shortened; collision resolution appends " (N)" when duplicates occur.

11. SSE job lifecycle & cleanup
    - Observation: Jobs are cleaned up after 60 seconds (`cleanupJob`), so clients listening for progress must connect promptly. If a client reconnects too late, job state may be gone and SSE returns an error message in Portuguese ("Job não encontrado").

12. Mixing of languages in responses
    - Observation: Some API error messages and logs are in Portuguese (left from the fork). If you need all responses in English or localized, those strings should be standardized.

13. Playlist embed scraping fragility
    - Symptoms: `Structure of playlist data unexpected` or JSON parse errors when reading the embedded `__NEXT_DATA__` payload from Spotify embed pages.
    - Cause: Spotify may change their embed payload structure and the code expects a specific JSON path to find `trackList`.
    - Impact: Playlist listing and playlist download features break.

14. No `start` script in package.json
    - Observation: `package.json` does not provide a `scripts.start` entry. Running the project under Node/PM2/etc may require a script or compiled JS output.

15. Error handling that returns Portuguese texts
    - Observation: Some `getErrorMessage` branches return Portuguese messages, which may be user-visible in API responses (`Spotify recusou as credenciais...`, `Erro desconhecido`, etc.).

---

## Recommendations / next steps to improve stability

- Make port configurable (via PORT environment variable).
- Add a `start` script to package.json and (optionally) provide a compiled JS build for Node deployments.
- Add explicit Node/Bun runtime checks and documentation about required Node version (18+).
- Centralize and translate user-facing error messages (Portuguese -> English) or provide i18n.
- Consider adding retries and better backoff for Spotify API calls and MP3 fetches.
- Add unit/integration tests for the scraping/parsing helpers (so upstream site changes are easier to detect and fix).
- Remove `puppeteer-core` from dependencies if you always use `puppeteer`, or document usage when providing your own browser binary.
- Replace fragile HTML parsing with more robust strategies if possible (for example, detect multiple candidate selectors, or improve fallback parsing).

---

## Running the server (example)

1. Install dependencies (Bun recommended):

```
bun install
```

2. Create `.env` with CLIENT_ID and CLIENT_SECRET (recommended):

```
CLIENT_ID=...
CLIENT_SECRET=...
```

3. Run with Bun:

```
bun index.ts
```

Or run with Node (ensure Node 18+ and a TypeScript runner or compile to JS first):

```
# compile using tsc or run via ts-node / Bun recommended
node index.js
```

---

## Contributing & notes

If you want me to:
- Commit additional changes (port via env, English-only messages, start script),
- Rename repository artifacts, add GitHub actions, or create a release,
I can make those updates. Tell me which changes you want and I will apply them.
