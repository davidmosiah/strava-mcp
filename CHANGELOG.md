# Changelog

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
