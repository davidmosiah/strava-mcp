# Changelog

## 0.4.2 - 2026-05-19

### Added

- **Dedicated HTTP retry middleware** (`src/services/http-retry.ts`) — extracted from `StravaClient.fetchWithRetry` into a reusable, testable function with exponential backoff (500ms / 1s / 2s), ±20% jitter, and `Retry-After` header parsing (supports both seconds and HTTP-date formats).
- **`STRAVA_NO_RETRY=true` env flag** — disables retries entirely for tests or callers that want raw error propagation.
- **`Retry-After` header now honored** — the prior implementation hard-coded a 60-second wait for HTTP 429; Strava's documented `X-RateLimit-Limit` cycle is now respected when the server provides `Retry-After`.
- **HTTP 408 added to retryable status set** alongside 429, 500, 502, 503, 504 — request-timeout responses are now transparently retried.
- **Network-error retries** — fetch failures (ECONNRESET, ENOTFOUND, timeouts) are now retried with the same backoff schedule as HTTP errors instead of bubbling up on the first failure.
- **Structured stderr logs** — each retry now writes `[strava-mcp] retry N/3 after Xms (status=Y or error=Z)` so agents can correlate spike-and-recovery patterns in their logs.
- `scripts/http-retry-test.mjs` — six-case unit suite covering happy path, Retry-After header, env disable flag, 401 non-retry, exhaustion, and network-error retry.

### Changed

- `StravaClient.fetchWithRetry` now delegates to the shared middleware so the auth-failure 401 re-auth flow benefits from the same backoff guarantees.

## 0.4.1 - 2026-05-11

### Fixed

- **Profile-store regex no longer false-positives on common wellness words.** Split `SECRET_PATTERNS` into `SECRET_KEY_PATTERNS` (broad, for field names like `oauth_token`) and `SECRET_VALUE_PATTERNS` (high-specificity, only credential shapes: JWTs, `Bearer <token>`, `sk_live_`, `sk-proj-`, `xoxb-`, `github_pat_`, raw `Authorization:` headers). Previously legitimate text like "5 training sessions per week", "limit cookies", "I need to refresh my approach", or "secret sauce: more sleep" was rejected.
- **Partial-profile reads no longer crash downstream.** `readProfileFile` now structurally merges with `DEFAULT_PROFILE` when legacy Hermes/OpenClaw files lacked sub-objects (goals, devices, training, nutrition, preferences, safety). Previously `buildProfileSummary` and `missingCriticalFields` would throw.
- **Onboarding `privacy_note` no longer hard-codes a single connector path.** Lists multiple example paths so the message reads correctly from every connector.

## 0.4.0 - 2026-05-11

- Add shared wellness-profile support backed by the canonical Delx Wellness profile store at `~/.delx-wellness/profile.json` (vendored from `delx-wellness/lib/profile-store.ts` commit ab83d1a so the connector stays self-contained — no new npm deps).
- Add `strava_profile_get` tool — read-only summary of the shared profile plus the missing-critical-fields hint and absolute storage path.
- Add `strava_profile_update` tool — patch the shared profile but only when `explicit_user_intent=true`; otherwise it returns `USER_ACTION_REQUIRED` so agents do not silently persist things the user did not confirm.
- Add `strava_onboarding` tool — returns the 11-question onboarding flow in `en` or `pt-BR`, current profile, missing critical fields, and a cross-connector hint for pairing with `wellness-nourish`, `wellness-cycle-coach`, and `wellness-cgm-mcp`.
- Add `strava-mcp-server onboarding` CLI command — emits the same flow as JSON to stdout and a friendly Markdown summary to stderr when the terminal is interactive. Supports `--locale pt-BR`.
- Privacy contract: the shared profile NEVER stores OAuth tokens, refresh tokens, API keys, cookies, session ids or biomarkers. Strava continues to redact GPS latlng and route geometry by default — this profile does not change that posture. Set `STRAVA_GPS_INCLUDE=true` or `include_gps=true` only when the user explicitly asks.
- `recommended_first_calls` on the agent manifest now leads with `strava_profile_get` before `strava_quickstart`.
- Tool count: 25 → 28.

## 0.3.0 - 2026-05-11

- Add `strava_quickstart` tool — personalized 3-step setup walkthrough adapted to current state (env vars set? OAuth token present? what's next?). Mentions `STRAVA_GPS_INCLUDE` and the default GPS/route-geometry redaction posture. Returns cross-connector hints to pair with wellness-nourish, wellness-cycle-coach, and wellness-cgm-mcp.
- Add `strava_demo` tool — realistic example payloads of `strava_daily_summary`, `strava_training_context`, and `strava_list_activities` (5km easy run, tempo intervals, long run, recovery ride) so agents see the contract before any real Strava API call.
- `recommended_first_calls` on the agent manifest now leads with `strava_quickstart` and `strava_demo`.
- Tool count: 23 → 25.

## 0.1.2

- Added `strava_agent_manifest` and `strava://agent-manifest` for machine-readable agent installation/runtime guidance.
- Added Hermes-specific diagnostics with `doctor --client hermes` and optional `client` support in `strava_connection_status`.
- `setup --client hermes` now writes a pinned Hermes MCP config plus a local Hermes skill that tells agents to use direct MCP tools.
- Added anti-friction guidance for Hermes: use `/reload-mcp` or `hermes mcp test strava`, not gateway restart, for normal Strava MCP config/data access.
- Added regression coverage for Hermes agent readiness, direct tool aliases and pinned package setup.

## 0.1.1

- Fixed collection Markdown previews so agents and humans no longer see `[object Object]` metadata.
- Added OAuth scope diagnostics to `doctor` and `strava_connection_status`.
- `doctor` now reports missing recommended scopes and asks for re-authorization when a token only has `read`.
- `setup` now writes the recommended read-only scopes explicitly.
- Added regression coverage for agent-readable output and scope readiness.

## 0.1.0

- Initial Strava MCP implementation.
- OAuth setup/auth/doctor CLI.
- 20 MCP tools, 5 resources and 3 prompts.
- Activity, stream, route, club, gear, athlete, zone and summary support.
- GPS privacy modes and local token/cache support.
