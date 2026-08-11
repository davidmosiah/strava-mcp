## 0.6.0 - 2026-08-05

### Added

- **`strava_activity_series`** — bounded, self-describing time-series for one
  activity metric under the shared **`agent-safe-series/v1`** contract (same
  shape as Garmin MCP and Mi Fitness Data Bridge / Kindred; design thread
  [garmin-mcp#19](https://github.com/davidmosiah/garmin-mcp/issues/19)):
  - Exact `stats` (avg/min/max/p25/p50/p75 + `percentile_method`) on
    **full-resolution** samples; returned `points[]` hard-capped (default 400,
    server max 500) via fixed time-bucket means.
  - `start_time`, `t_unit: "seconds_from_start"`, `requested_resolution_seconds`,
    honest `downsampled` / `source_points` / `method`.
  - `data_quality.coverage_anchor`: `nominal_duration` (from activity
    `elapsed_time`) | `sample_span` — head/tail sensor drops no longer look like
    a shorter, fully-sampled workout (Kindred duration-anchored coverage).
  - `time_in_zone.reference_source`: `caller_provided` |
    `activity_recorded_max` | `observed_max`.
  - GPS/latlng never enters the series tool; stays behind
    `strava_get_activity_streams` + `include_gps` escalation.
  - Synthetic 3h fixture + `scripts/activity-series-test.mjs` (same ride profile
    as garmin-mcp).

### Changed

- Prefer `strava_activity_series` over raw streams in agent guidance
  (capabilities, Hermes skill, stream investigator prompt, FAQ).
- `strava_get_activity_streams` description points agents at the series tool for
  context-safe work; raw multi-key / GPS path unchanged.

## 0.5.0 - 2026-08-01

### Fixed

- `strava_demo` returned examples that did not match any tool this server has.
  An agent that wired its parser to the demo — the tool's entire purpose — got
  it wrong in three ways:
  - `strava_daily_summary`: every one of the 11 advertised key paths was
    invented (`date`, `activities`, `sport_mix`, `intensity.*`,
    `total_distance_km`, `total_duration_min`, `elevation_gain_m`), and all 41
    real ones were missing (`kind`, `window`, `data_quality`, `latest_activity`,
    `training_load.stats.top_sports[]`, `diagnostic`, `safety`).
  - `strava_training_context`: 11 invented key paths, 24 real ones missing. The
    worst was `load_band: "moderate"` — the real field is
    `recent_training_load`, and its vocabulary is `low|normal|high|unknown`, so
    an agent branching on `"moderate"` would never match even after finding the
    right key. Also missing: `context_contract_version`, `privacy.*`,
    `recommended_handoff.*`, `telegram_summary`.
  - `strava_list_activities`: records advertised `distance_m` / `moving_time_s`,
    which the server never emits (they are `distance` / `moving_time`), and the
    whole envelope — `endpoint`, `privacy_mode`, `next_page`, `has_more`,
    `pages_fetched` — plus 47 record fields were absent.
  The demo now shows the real shapes, including the default `structured`
  privacy mode for the activity list.

### Added

- `npm run test:demo-contract` (in `npm test`): runs the real
  `buildDailySummary` / `buildTrainingContext` / `buildCollectionOutput` over
  `fixtures/strava-activities.mjs` and fails in both directions — a key the demo
  invents, and a contract key the demo omits. Arrays compare as the union of
  their elements, so a page mixing rides and runs describes the whole shape. The
  fixture carries GPS fields on purpose, so the gate also proves they never
  reach the agent.

### Changed

- Demo payload moved to `src/services/demo.ts` and the collection envelope to
  `src/services/collection.ts`, so the gate exercises the same code path the
  tool does instead of re-implementing it.

## 0.4.11 - 2026-07-30

### Added / Fixed

- exchange_code description documents explicit user OAuth action (scorecard 100).

# Changelog

## 0.6.1

- Security: override `fast-uri@3.1.5` and `ip-address@10.4.0` (high transitive).




## 0.4.10 - 2026-07-30

### Security

- Agent-requested `privacy_mode=raw` and `include_gps=true` require `explicit_user_intent=true` (config-default raw still allowed without per-call intent).

## 0.4.9 - 2026-07-30

### Security

- Security: require explicit_user_intent on revoke/disconnect tools so agents cannot wipe OAuth grants autonomously.

## 0.4.8 - 2026-07-30

### Fixed

- **Pagination `next_page` off-by-one** — a full single page used to report `next_page` equal to the page just fetched (`page + (pages === 0 ? 0 : 0)` is a no-op). Agents following `next_page`/`has_more` re-requested the same page forever. Now `next_page = startPage + pages_fetched` (e.g. page 1 full → 2). Covered by `endpoint-contract-test.mjs`.

## 0.4.7 - 2026-07-16

### Fixed

- Preserve complete upstream activity, route, club, gear and physiology fields in structured mode, including future Strava additions, while recursively removing GPS and secret-bearing values.
- Convert timezone-aware ISO filters to Strava epoch seconds by instant and reject invalid or reversed ranges before any HTTP request.
- Add an executable HTTP-boundary regression suite and prove summary failures propagate instead of becoming silent partial success.
- Raise the transitive Hono override to 4.12.30 so production installs pass `npm audit --omit=dev` with zero known vulnerabilities.

## 0.4.6 - 2026-05-29

### Changed

- **README Quickstart rewrite** — replaced "Setup in 60 seconds" with a numbered install → OAuth → verify → first-call flow, including real captured terminal output for `auth --no-open`, `doctor` (READY), and a `strava_demo` first call. The demo step lets new users see the exact response shape and wire prompts before connecting a live Strava account. Docs-only; no code or tool behavior changes.

## 0.4.3 - 2026-05-20

### Added

- **HTTP response cache middleware** (`src/services/http-cache.ts`) — in-memory cache layered OUTSIDE retry (`fetchWithCache → fetchWithRetry → fetch`), so cached responses skip both network and retry. Default 60s TTL for GET only; POST/PUT/DELETE and 4xx/5xx responses are never cached.
- **`STRAVA_NO_CACHE=true` env var** — global per-process cache bypass; advertised in `server.json`.
- **Per-call `cache_ttl: 0`** request option — opts a single call out of cache without disabling globally.
- **Query-param-order-insensitive cache keys** — `?after=…&before=…&per_page=…` and `?per_page=…&after=…&before=…` share one cache entry.
- **`strava_cache_status` now reports `http_cache` stats** alongside SQLite stats: `size`, `hit_count`, `miss_count`, `hit_rate`, `default_ttl_seconds`, `bypass_env_var`.
- `scripts/http-cache-test.mjs` — eight-case unit suite covering cache hit, POST never cached, TTL expiration, query-param normalization, 4xx not cached, env-var bypass, per-call `cache_ttl: 0`, and `getCacheStats()` math.

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
