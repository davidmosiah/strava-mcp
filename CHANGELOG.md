# Changelog

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
