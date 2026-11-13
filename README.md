# YouSong owner web

Spanish-language Next.js owner panel using FusionAuth login and a same-origin backend-for-frontend (BFF). Each authenticated account manages only its own establishment, resolved by the backend from the validated access-token subject. No role, browser-selected establishment/session UUID, pasted bearer credential or legacy admin/staff fallback grants access.

**Runtime prerequisite:** the running backend must serve the owner API and the schema required by migrations V8–V10. The backend source and local listener were subsequently replaced externally; inspecting their revision/process identity alone does not prove the loaded build or migration state. Verify live operation through a legitimate account before claiming integration. Do not restart another process or apply migrations based on the earlier runtime snapshot. This client does not restart services, migrate data, claim old ownerless records or simulate empty data on routing failures. Only exact `404 NO_ESTABLISHMENT` enables onboarding.

## Local development

Use Node 24 and the project's pinned Bun 1.4.4 (`bun install --frozen-lockfile`, then `bun dev`). `bun.lock` remains authoritative; no npm lock migration or existing direct dependency upgrades. Auth.js is pinned to `next-auth@5.0.0-beta.30`; direct JWT verification uses `jose@6.2.17`. Installation scripts were not run. With dependencies already installed, `node node_modules/next/dist/bin/next dev` also works.

Provide the following in ignored local environment configuration. Secret values must be supplied privately, never committed, logged or copied into documentation:

| Variable | Development configuration |
| --- | --- |
| `AUTH_URL` | `http://localhost:3000` |
| `AUTH_SECRET` | Private random session-encryption secret |
| `FUSIONAUTH_URL` | `http://127.0.0.1:9011` (exact issuer) |
| `FUSIONAUTH_CLIENT_ID` | `c2f6a1b4-3d5e-4f70-8a9b-6e1d2c3b4a59` |
| `FUSIONAUTH_CLIENT_SECRET` | Private confidential-client secret |
| `API_BASE_URL` | `http://localhost:8080` (server-only, preferred) |
| `NEXT_PUBLIC_API_URL` | Optional API-origin fallback; never a credential |

Production fails closed unless application, issuer and backend origins all use HTTPS. HTTP is accepted only for loopback development. Origins cannot include credentials, paths, query strings or fragments. Do not run a production server with development HTTP settings. The provider registration must allow `http://localhost:3000/api/auth/callback/fusionauth` and logout return `http://localhost:3000`. No registration or backend configuration is changed by this application.

Select **Iniciar sesión con FusionAuth** and authenticate at the provider. Your establishment and access QR load on entry; **Reintentar conexión** is available if that read fails. **Cerrar sesión** invalidates the local session/store entry and redirects through the configured FusionAuth `/oauth2/logout` with the fixed application return origin. Provider registration and real logout behavior still require live verification.

## Authentication and security boundaries

- Confidential OIDC Authorization Code with PKCE S256, state and nonce; scopes exactly `openid offline_access`. Auth.js handles CSRF cookies/checks and encrypted HTTPOnly, SameSite=Lax session cookies (Secure on HTTPS). Lax permits the top-level OIDC callback. Login/logout server actions additionally validate Origin; mutations and Auth.js POST routes reject absent or foreign Origin. Do not weaken these checks behind a reverse proxy.
- Access/refresh tokens stay in a bounded **process-local server store**, never session JSON, client props, browser storage or fetch headers. Auth.js encrypted cookies contain only an opaque store ID and UI role hints. ID tokens are not stored or used for API access. `/api/auth/session` returns only roles and expiry.
- UI roles are derived server-side from RS256 access-token signature verification with issuer, audience (client ID), expiry, subject and `tty=at` checks. Keys come from the configured issuer's `/.well-known/jwks.json`; the inspected provider publishes this path. Backend authorization remains authoritative and backend 401/403 statuses are preserved.
- The JWT callback and BFF share refresh logic: 30-second expiry margin, authenticated `client_secret_post` refresh grant, rotation persisted immediately, old refresh token preserved if omitted. Failed refresh invalidates the server entry and requires reauthentication. One promise per entry prevents concurrent refresh-token reuse, including parallel BFF/session requests. Logout during refresh cannot resurrect the entry.
- **Single Node worker only:** store capacity 1,000 sessions, absolute lifetime eight hours, opportunistic expiry cleanup. Restarts, capacity exhaustion and unknown IDs fail closed; restarts require login again. No distributed persistence, multiworker synchronization, horizontal scaling or serverless session continuity is claimed. A production multiworker rollout requires a shared transactional token store, not separate per-instance refresh caches. Expired entries are bounded and reclaimed on lookup/new login; there is no indefinite session lifetime.
- The BFF allowlists only the route/method contracts below, public slug parameters and bounded catalog query parameters. Legacy `/api/admin` and `/api/staff` paths and owner UUID parameters are rejected before credentials or backend effects. It never forwards client Authorization, cookies or arbitrary destinations. Only create/edit/list-publication/playback-finish routes accept JSON: a streaming 16 KiB byte limit, five-second read deadline, object/field/type/enum/limit validation and exact Origin checks run before credential lookup or upstream effects. PUT/PATCH share the existing cookie-only route handler. Session/service/playback-start commands remain bodyless. Error responses expose only a bounded problem code, not upstream diagnostics. Backend requests use only server access tokens, no redirects/cookies/cache and a 20-second timeout. Refresh/OIDC/JWKS requests also have timeouts and refuse redirects. Responses omit backend cookies/redirect headers and are not cached.
- Authentication errors are not logged with provider payloads, cookies or credentials. Infrastructure rate limiting, deployment CSP/security headers and operational monitoring remain deployment work; no production-readiness claim is made.

## Connected contracts

Browser routes prefix the following backend paths with `/api/bff`:

All owner paths below are relative to `/api/mi-establecimiento`; they require a valid access token, not ADMINISTRADOR/OPERADOR roles. Only the backend resolves ownership. Local IDs retained by component operation scopes are never sent in owner paths or bodies.

| Capability | Method and relative path |
| --- | --- |
| Read/create/update own establishment | `GET / POST / PATCH` root |
| Current session / access QR | `GET /sesion-actual`, `GET /qr` |
| Open / close | `POST /sesiones`, `POST /sesion/cierre` |
| Pause / resume session | `POST /sesion/pausa`, `POST /sesion/reanudacion` |
| Resume establishment service / end maintenance | `POST /reanudacion`, `POST /mantenimiento/fin` |
| Catalog / suggestions | `GET /catalogo/busqueda?q=...&pagina=...`, `GET /catalogo/sugerencias?q=...` |
| Current/publish default list / history | `GET / PUT /lista-defecto`, `GET /listas-defecto` |
| Manual server playback state | `POST /reproduccion/siguiente`, `POST /reproduccion/fin` |

Public effective availability uses `GET /api/public/establecimientos/{qrSlug}` and queue snapshots use its `/cola` suffix. These backend projections are public; this BFF still requires authenticated cookies. Participant join/credentials are not exposed through the web BFF.

Published history summaries use the backend field `totalCanciones` for the stored version's song count; counts are not fabricated by the client.

Only `404` with problem code `NO_ACTIVE_SESSION` means no current session. Opening requires an active establishment and configured default list. Closing requires confirmation and shows the backend's actual unattended-request count. After mutation errors, refresh state before retrying: a transport failure may follow a successful write. Authenticated roleless accounts see the same owner controls. Missing ownership enables creation, never a foreign-ID selector. Service pause, maintenance and configured opening hours may prevent participation independently from session state.

QR SVG remains isolated in a revocable image-context blob, never injected as HTML. **Acceso móvil** exposes the actual QR, SVG download and **Abrir acceso móvil** link using the validated API URL. This does not establish phone reachability: loopback-only origins, LAN/firewall, participant-app routing and real QR scanning still require separately authorized browser/device proof. Catalog results retain actual title, artist/channel, duration and pagination. Remote thumbnails are deliberately not fetched. Session pause/resume is explicit. Existing establishment pauses and maintenance can be explicitly ended, never silently cleared. Schedule editing, starting maintenance, moderation, SSE and actual audio playback are outside this unit. Empty backend schedules are unrestricted; nonempty schedules remain authoritative and are not changed by opening a session.

## Functional demo workflow (manual acceptance still required)

Only perform these steps against an explicitly authorized disposable target with legitimately provisioned staff/participants. The implementation and automated tests do not seed records or execute this demo.

1. Log in with a legitimately provisioned account and load **Mi establecimiento**. If this account has none, use **Crear establecimiento**. In **Configuración y listas**, edit name/time zone/active status; the printed QR slug is immutable. A session in progress prevents deactivation.
2. **Configuración y listas** keeps song search, selection, ordering and saving in one workspace, with no separate **Catálogo** navigation entry. The draft survives navigation between owner tabs. Current list/history load automatically on entry and initialize the draft only before the first user edit. Select actual results or known-song suggestions; adding does not request a song or publish anything. Suggestions debounce by 350 ms; searching and pagination remain explicit. **Guardar lista** publishes 1–200 unique video IDs with **En orden** or **Aleatorio** rotation, then reads the list/history once after confirmation. Saved list and history are under **Ver lista guardada e historial**. Failed or uncertain saves retain edits, never retry the write and require **Revisar guardado** before another save. Catalog configuration, quota and network availability remain prerequisites.
3. A confirmed saved-list read updates the opening prerequisite automatically; open the session explicitly. `409 NO_DEFAULT_LIST` remains a legitimate rejection. Read effective availability separately: session states are ABIERTA/PAUSADA/CERRANDO/CERRADA, service states are ABIERTO/PAUSADO/CERRADO/MANTENIMIENTO. Display/download the QR and have a legitimate participant enter through QR and explicitly consent in the participant application. No staff login is introduced for participants.
4. **Cola musical** shows only concise song rows: the actual current song, pending songs, votes and estimated waits. It reads on mount, then every six seconds after each read finishes; no overlapping polling or writes. A failed or older read keeps the last good rows with a stale hint and disables playback mutations until a valid read. Same-version service changes are accepted. Navigating away stops polling and fences late responses. There are no identities, personal `votado`, version/timestamp diagnostics or playback controls in this view.
5. In **Panel operativo** only, **Siguiente** and **Finalizar** preserve explicit playback-state commands and the Completada, Saltada and Fallida outcomes. The backend can fall back to its default list with `origen: DEFECTO`, null `solicitudId` and zero votes; request playback uses `origen: SOLICITUD`. Finish includes nullable `motivoCodigo`; skipping without an explicit reason uses backend SALTO_MANUAL. These controls change server state only: no audible player or client automatic advance is claimed. QUEUE_EMPTY, PLAYBACK_IN_PROGRESS and NO_ACTIVE_PLAYBACK remain errors, not simulated player success.
6. Optionally pause/resume the session explicitly; public availability is read again after a confirmed change. Participants retain access during pause, but cannot join/request/vote. Close the session as owner and verify the actual unattended-request count and participant access invalidation. Refresh the public queue to inspect the closed snapshot.

Mutations are never retried automatically. Acknowledgments and authoritative reads determine UI state; duplicate clicks are fenced synchronously, older queue versions are rejected, and late completions are ignored after scope/unmount/auth changes. Queue mutation rejection or an uncertain network result triggers only a queue read, not another mutation. Failed creation/edit/publication keeps the draft and requires consulting server state before another save. Only queue reads poll; list reads run on entry and after confirmed publication. No API request starts during prerender. Role hints never replace backend ownership authorization.

## Verification

```sh
node scripts/test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/@biomejs/biome/bin/biome check
git diff --check
# Parent-owned production validation:
node node_modules/next/dist/bin/next build
```

Tests compile TypeScript to CommonJS in a fresh system temporary directory, run Node's test runner, and clean up the directory. They use synthetic credentials, mocked transport/discovery and generated signing keys; no account login or authenticated backend mutation is performed. Tests exercise Auth.js's generated S256/state/nonce/cookies, JWT verification, refresh/rotation/failure/concurrency, session projection, BFF rejection/header/status boundaries and preserved DTO contracts.

The previous client baseline passed 44 Node tests and production build. Owner-route migration RED was observed with `node scripts/test.mjs`: exit 1, 18 passing / 30 failing out of 48, including obsolete paths, missing onboarding handling, legacy-route acceptance and MANTENIMIENTO rejection. A subsequent focused run reached 46/48, exposing the newly requested recovery-route allowlist and a stale queue-error expectation. Final owner-unit checks passed: 50/50 Node tests (all 44 previous cases retained with requested route/DTO migration), TypeScript with no diagnostics, Biome with only the three existing informational template hints, and `git diff --check`. Normalization initially flagged one new semantic-element issue, corrected by using `<output>` for readiness status. The parent subsequently observed production-build exit 0, added two independently exercised rejection/deadline regression cases, and observed 52/52 tests, TypeScript, Biome and `git diff --check` exit 0. Independent verification found no candidate blocker across 25 synthetic-transport probes and nine baseline differential cases. Its isolated Biome command failed because the scratch snapshot lacked `.gitignore`; that was not a candidate lint defect and was not retried. The original-tree Biome check passed with the three existing informational hints.

Browser, keyboard/responsive prototype fidelity, actual login/refresh/logout, and authenticated backend operation still require independent proof. Unit tests and build success cannot establish those results.
