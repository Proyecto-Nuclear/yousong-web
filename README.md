# YouSong administrative web

Spanish-language Next.js administrative panel using FusionAuth login and a same-origin backend-for-frontend (BFF). Existing session, establishment, QR and catalog functionality is preserved; no pasted bearer credentials or direct browser/backend requests remain.

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

Select **Iniciar sesión con FusionAuth**, authenticate at the provider, then **Cargar establecimiento**. **Cerrar sesión** invalidates the local session/store entry and redirects through the configured FusionAuth `/oauth2/logout` with the fixed application return origin. Provider registration and real logout behavior still require live verification.

## Authentication and security boundaries

- Confidential OIDC Authorization Code with PKCE S256, state and nonce; scopes exactly `openid offline_access`. Auth.js handles CSRF cookies/checks and encrypted HTTPOnly, SameSite=Lax session cookies (Secure on HTTPS). Lax permits the top-level OIDC callback. Login/logout server actions additionally validate Origin; mutations and Auth.js POST routes reject absent or foreign Origin. Do not weaken these checks behind a reverse proxy.
- Access/refresh tokens stay in a bounded **process-local server store**, never session JSON, client props, browser storage or fetch headers. Auth.js encrypted cookies contain only an opaque store ID and UI role hints. ID tokens are not stored or used for API access. `/api/auth/session` returns only roles and expiry.
- UI roles are derived server-side from RS256 access-token signature verification with issuer, audience (client ID), expiry, subject and `tty=at` checks. Keys come from the configured issuer's `/.well-known/jwks.json`; the inspected provider publishes this path. Backend authorization remains authoritative and backend 401/403 statuses are preserved.
- The JWT callback and BFF share refresh logic: 30-second expiry margin, authenticated `client_secret_post` refresh grant, rotation persisted immediately, old refresh token preserved if omitted. Failed refresh invalidates the server entry and requires reauthentication. One promise per entry prevents concurrent refresh-token reuse, including parallel BFF/session requests. Logout during refresh cannot resurrect the entry.
- **Single Node worker only:** store capacity 1,000 sessions, absolute lifetime eight hours, opportunistic expiry cleanup. Restarts, capacity exhaustion and unknown IDs fail closed; restarts require login again. No distributed persistence, multiworker synchronization, horizontal scaling or serverless session continuity is claimed. A production multiworker rollout requires a shared transactional token store, not separate per-instance refresh caches. Expired entries are bounded and reclaimed on lookup/new login; there is no indefinite session lifetime.
- The BFF allowlists only the route/method contracts below, UUID/slug path parameters and catalog query parameters. It never forwards client Authorization, cookies or arbitrary destinations. Only create/edit/list-publication/playback-finish routes accept JSON: a streaming 16 KiB byte limit, five-second read deadline, object/field/type/enum/limit validation and exact Origin checks run before credential lookup or upstream effects. PUT/PATCH share the existing cookie-only route handler. Legacy commands remain bodyless. New-contract error responses expose only a bounded problem code, not upstream diagnostics. Backend requests use only server access tokens, no redirects/cookies/cache and a 20-second timeout. Refresh/OIDC/JWKS requests also have timeouts and refuse redirects. Responses omit backend cookies/redirect headers and are not cached.
- Authentication errors are not logged with provider payloads, cookies or credentials. Infrastructure rate limiting, deployment CSP/security headers and operational monitoring remain deployment work; no production-readiness claim is made.

## Connected contracts

Browser routes prefix the following backend paths with `/api/bff`:

| Capability | Backend contract | Role |
| --- | --- | --- |
| Establishments | `GET /api/staff/establecimientos` | ADMINISTRADOR or OPERADOR |
| Current session | `GET /api/staff/establecimientos/{id}/sesion-actual` | ADMINISTRADOR or OPERADOR |
| Open session | `POST /api/admin/establecimientos/{id}/sesiones` | ADMINISTRADOR |
| Close session | `POST /api/admin/sesiones/{id}/cierre` | ADMINISTRADOR |
| Access QR | `GET /api/admin/establecimientos/{id}/qr` | ADMINISTRADOR |
| Catalog | `GET /api/staff/catalogo/busqueda?q=...&pagina=...` | ADMINISTRADOR or OPERADOR |
| Suggestions | `GET /api/staff/catalogo/sugerencias?q=...` | ADMINISTRADOR or OPERADOR |
| Create establishment | `POST /api/admin/establecimientos` | ADMINISTRADOR |
| Edit establishment | `PATCH /api/admin/establecimientos/{id}` | ADMINISTRADOR |
| Current default list | `GET /api/staff/establecimientos/{id}/lista-defecto` | ADMINISTRADOR or OPERADOR |
| Publish list | `PUT /api/admin/establecimientos/{id}/lista-defecto` | ADMINISTRADOR |
| List history | `GET /api/admin/establecimientos/{id}/listas-defecto` | ADMINISTRADOR |
| Public queue snapshot | `GET /api/public/establecimientos/{qrSlug}/cola` | Public backend route; this BFF requires staff authentication |
| Start next server request | `POST /api/staff/sesiones/{id}/reproduccion/siguiente` | ADMINISTRADOR or OPERADOR |
| Record playback finish | `POST /api/staff/sesiones/{id}/reproduccion/fin` | ADMINISTRADOR or OPERADOR |

Published history summaries use the backend field `totalCanciones` for the stored version's song count; counts are not fabricated by the client.

Only `404` with problem code `NO_ACTIVE_SESSION` means no current session. Opening requires an active establishment and configured default list. Closing requires confirmation and shows the backend's actual unattended-request count. After mutation errors, refresh state before retrying: a transport failure may follow a successful write. UI role gating hides admin-only operations for operators; it never replaces backend authorization.

QR SVG remains isolated in a revocable image-context blob, never injected as HTML. Catalog results retain actual title, artist/channel, duration and pagination. Remote thumbnails are deliberately not fetched. Metrics, blocking, pause/resume, maintenance, scheduling and actual audio playback remain unavailable, without synthetic data.

## Functional demo workflow (manual acceptance still required)

Only perform these steps against an explicitly authorized disposable target with legitimately provisioned staff/participants. The implementation and automated tests do not seed records or execute this demo.

1. Log in as ADMINISTRADOR and load establishments. If empty, use **Crear establecimiento**. In **Configuración y listas**, edit name/time zone/active status; the printed QR slug is immutable. A session in progress prevents deactivation.
2. Search the catalog and select actual results or known-song suggestions into the list draft. Suggestions debounce by 350 ms; searching and pagination are explicit. Publish 1–200 unique eleven-character video IDs, with SECUENCIAL or ALEATORIA rotation. Consult the current list and administrator-only history to verify version/name/count/date. Drafts survive publication/provider errors. Catalog configuration, quota and network availability are real prerequisites.
3. Open the session, display/download its QR and have a legitimate participant enter through QR and explicitly consent in the participant application. No staff login is introduced for participants.
4. Have a participant request a real catalog song first. In **Cola musical**, manually refresh the public snapshot. It shows service state (ABIERTO/PAUSADO/CERRADO), queue version, actual votes, estimated waits and current server playback state; it has no participant identities or personal `votado` field.
5. An OPERADOR or ADMINISTRADOR can start the next queued request and record COMPLETADA, SALTADA or FALLIDA. These controls change server state only: there is no audio player, automatic advance or default-list fallback. QUEUE_EMPTY, PLAYBACK_IN_PROGRESS and NO_ACTIVE_PLAYBACK remain errors, not simulated player success.
6. Close the session as administrator and verify the actual unattended-request count and participant access invalidation. Refresh the public queue to inspect the closed snapshot.

Mutations are never retried automatically. Acknowledgments and authoritative reads determine UI state; duplicate clicks are fenced synchronously, older queue versions are rejected, and late completions are ignored after scope/unmount/auth changes. Queue mutation rejection or an uncertain network result triggers only a queue read, not another mutation. Failed creation/edit/publication keeps the draft and requires consulting server state before another save. Explicit refresh replaces polling, and no API request starts during prerender. Staff UI hints never replace backend authorization.

## Verification

```sh
node scripts/test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/@biomejs/biome/bin/biome check
node node_modules/next/dist/bin/next build
```

Tests compile TypeScript to CommonJS in a fresh system temporary directory, run Node's test runner, and clean up the directory. They use synthetic credentials, mocked transport/discovery and generated signing keys; no account login or authenticated backend mutation is performed. Tests exercise Auth.js's generated S256/state/nonce/cookies, JWT verification, refresh/rotation/failure/concurrency, session projection, BFF rejection/header/status boundaries and preserved DTO contracts.

Final functional-demo checks: 44/44 Node tests passed (including all 19 previous tests), TypeScript passed, and Biome passed with three pre-existing informational hints in unchanged authentication tests. Independent review found that the initial history contract incorrectly expected `cantidadCanciones`; the backend actually returns `totalCanciones`. A regression through the public DemoApi first failed with the invalid-response error (43 passing, one failing), then all 44 tests passed after correcting the contract, guard, history display and fixture. The parent rebuilt this corrected source in the background: exit 0, successful compilation, type checking and generation of all four static pages. The build warned that an unrelated lockfile outside this repository was ignored; no configuration or external file was changed.

Browser, keyboard/responsive prototype fidelity, actual login/refresh/logout, and authenticated backend operation still require independent proof. Unit tests and build success cannot establish those results.
