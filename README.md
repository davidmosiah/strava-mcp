# Strava MCP Unofficial

[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-7C3AED?style=flat-square&logo=anthropic&logoColor=white)](https://modelcontextprotocol.io) [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Provider: Strava](https://img.shields.io/badge/data-Strava-FC4C02?style=flat-square&logo=strava&logoColor=white)](https://strava.com) [![npm version](https://img.shields.io/npm/v/strava-mcp-unofficial?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/strava-mcp-unofficial)


[![CI](https://github.com/davidmosiah/strava-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/davidmosiah/strava-mcp/actions/workflows/ci.yml)

Unofficial, local-first MCP server that lets AI agents read your Strava activities, routes, streams and training context through the official Strava API.

Website: <https://stravamcp.vercel.app/>

GitHub Pages mirror: <https://davidmosiah.github.io/strava-mcp/>

> **Unofficial project:** this repository is not affiliated with, endorsed by, sponsored by, or supported by Strava, Inc. Strava is a trademark of its respective owner. Use this project only with your own Strava account and according to Strava's Developer Terms and API policies.

Built by [David Mosiah](https://github.com/davidmosiah) for people building practical AI-agent workflows around training, endurance, routes, activity streams and performance reflection.

## What It Does

`strava-mcp-server` exposes Strava to MCP-compatible agents with a privacy-first local setup:

- OAuth setup, auth and `doctor` CLI for non-technical users.
- OAuth scope diagnostics: `doctor` detects limited tokens before agents hit permission errors.
- Agent manifest: `strava_agent_manifest` and `strava://agent-manifest` give agents machine-readable install/runtime rules.
- Hermes-aware setup: `setup --client hermes` writes a pinned MCP config and a local Hermes skill to reduce terminal/gateway friction.
- Activity history: runs, rides, swims, walks, workouts and sport metadata.
- Activity details: distance, moving time, elevation, heart rate, power, relative effort and gear.
- Activity streams: time, distance, altitude, cadence, watts, heartrate and optional GPS lat/lng.
- Athlete profile, zones, aggregate stats, routes, clubs and gear.
- Daily and weekly workflow summaries for training decisions.
- Privacy modes: `summary`, `structured`, `raw`.
- GPS protection by default: raw route geometry and lat/lng streams require explicit intent.
- Optional SQLite cache and local token storage with `0600` permissions.

The server runs over MCP `stdio`, so it works with Claude Desktop, Cursor, Windsurf, Hermes, OpenClaw and other MCP clients.

## Install

```bash
npx -y strava-mcp-unofficial setup
npx -y strava-mcp-unofficial auth
npx -y strava-mcp-unofficial doctor
```

`doctor` should report the recommended scopes as granted:

```text
read activity:read_all profile:read_all
```

If you only see `read`, re-run:

```bash
npx -y strava-mcp-unofficial auth
```

For MCP clients, use the package without a subcommand so it starts the stdio server:

```json
{
  "mcpServers": {
    "strava": {
      "command": "npx",
      "args": ["-y", "strava-mcp-unofficial"]
    }
  }
}
```

## Hermes / Server Install

On a remote Hermes server, keep secrets out of chat and MCP client config when possible:

```bash
npx -y strava-mcp-unofficial setup --client hermes --no-auth
npx -y strava-mcp-unofficial auth
npx -y strava-mcp-unofficial doctor --client hermes
hermes mcp test strava
```

If the browser OAuth flow must happen on your local machine, run `auth` locally, then copy only `~/.strava-mcp/tokens.json` to the server with `chmod 600`. The token must include `activity:read_all profile:read_all read` for activity history and streams.

Hermes usually exposes names with its MCP prefix. Common direct tools:

- `mcp_strava_strava_agent_manifest`
- `mcp_strava_strava_connection_status`
- `mcp_strava_strava_daily_summary`
- `mcp_strava_strava_weekly_summary`
- `mcp_strava_strava_get_activity_streams`

After editing `~/.hermes/config.yaml`, use `/reload-mcp` or `hermes mcp test strava`. Do not restart the Hermes gateway for normal Strava data access.

## Create A Strava App

Create an app at <https://www.strava.com/settings/api>.

Recommended callback / redirect URI:

```text
http://127.0.0.1:3000/callback
```

Default read scopes:

```text
read activity:read_all profile:read_all
```

Why these scopes:

- `read`: public profile, routes and public Strava resources.
- `activity:read_all`: your activities, including private activities visible to your app.
- `profile:read_all`: fuller authenticated athlete profile fields.

No write scope is requested by default.

## Environment Variables

`setup` writes these into `~/.strava-mcp/config.json`, so most users do not need to manually export them.

```bash
export STRAVA_CLIENT_ID="your-client-id"
export STRAVA_CLIENT_SECRET="your-client-secret"
export STRAVA_REDIRECT_URI="http://127.0.0.1:3000/callback"

# Optional
export STRAVA_SCOPES="read activity:read_all profile:read_all"
export STRAVA_PRIVACY_MODE="structured" # summary | structured | raw
export STRAVA_CACHE="sqlite"
```

## Tools

Auth and setup:

- `strava_agent_manifest`
- `strava_get_auth_url`
- `strava_exchange_code`
- `strava_revoke_access`
- `strava_connection_status`
- `strava_cache_status`
- `strava_privacy_audit`
- `strava_capabilities`

Athlete and training:

- `strava_get_athlete`
- `strava_get_zones`
- `strava_get_athlete_stats`
- `strava_list_activities`
- `strava_get_activity`
- `strava_get_activity_zones`
- `strava_get_activity_streams`

Routes and context:

- `strava_list_routes`
- `strava_get_route`
- `strava_list_clubs`
- `strava_get_gear`

Workflow tools:

- `strava_daily_summary`
- `strava_weekly_summary`

## Resources

- `strava://capabilities`
- `strava://agent-manifest`
- `strava://athlete`
- `strava://latest/activity`
- `strava://summary/daily`
- `strava://summary/weekly`

## Prompts

- `daily_training_director`
- `weekly_endurance_review`
- `activity_stream_investigator`

## Data Boundary

This project uses the official Strava API v3. When this project says `raw`, it means the upstream JSON returned by supported Strava endpoints.

It does **not** mean continuous 24/7 sensor telemetry. Strava activity streams are tied to recorded activities and may include data such as heartrate, cadence, watts, altitude, distance and optional GPS lat/lng when Strava has it.

## Security Model

- Tokens stay local under `~/.strava-mcp/tokens.json`.
- Local config is written with user-only permissions.
- MCP tools do not return OAuth tokens.
- Write/upload scopes are not requested by default.
- GPS/map fields are removed from summary mode and limited in structured mode.
- Raw payloads and GPS streams require explicit opt-in.
- This project is not medical advice.

## Development

```bash
git clone https://github.com/davidmosiah/strava-mcp.git
cd strava-mcp
npm install
npm test
```

## Links

- Docs: <https://stravamcp.vercel.app/>
- Source: <https://github.com/davidmosiah/strava-mcp>
- npm: <https://www.npmjs.com/package/strava-mcp-unofficial>
- Delx Wellness registry: <https://github.com/davidmosiah/delx-wellness>
- Connector quality standard: <https://github.com/davidmosiah/delx-wellness/blob/main/docs/connector-quality-standard.md>
- Strava API docs: <https://developers.strava.com/docs/reference/>
- Strava auth docs: <https://developers.strava.com/docs/authentication/>
