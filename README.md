# strava-mcp-server

[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-7C3AED?style=flat-square&logo=anthropic&logoColor=white)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Provider: Strava](https://img.shields.io/badge/data-Strava-FC4C02?style=flat-square&logo=strava&logoColor=white)](https://strava.com)
[![npm version](https://img.shields.io/npm/v/strava-mcp-unofficial?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/strava-mcp-unofficial)
[![GitHub stars](https://img.shields.io/github/stars/davidmosiah/strava-mcp?style=flat-square&logo=github)](https://github.com/davidmosiah/strava-mcp/stargazers)
[![npm downloads](https://img.shields.io/npm/dm/strava-mcp-unofficial?style=flat-square&color=0ea5a3&logo=npm)](https://www.npmjs.com/package/strava-mcp-unofficial)
[![CI](https://github.com/davidmosiah/strava-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/davidmosiah/strava-mcp/actions/workflows/ci.yml)
[![Delx Wellness](https://img.shields.io/badge/part%20of-Delx%20Wellness-0ea5a3?style=flat-square)](https://github.com/davidmosiah/delx-wellness)
[![Agent-ready MCP](https://img.shields.io/badge/agent--ready-MCP-0ea5a3?style=flat-square)](https://wellness.delx.ai/connectors/strava)

**Local-first MCP server that connects AI agents to your Strava activities, routes, streams and training context.**

> **Unofficial project.** Not affiliated with, endorsed by or supported by Strava, Inc. Strava is a trademark of its respective owner. Use this only with your own Strava account and in line with Strava's API agreement.

Built by [David Mosiah](https://github.com/davidmosiah) for people who use Claude, Cursor, Hermes, OpenClaw or other MCP-compatible agents to think about training, endurance and performance — without copy-pasting numbers from Strava.

Part of [Delx Wellness](https://github.com/davidmosiah/delx-wellness), a registry of local-first wellness MCP connectors.

> If this connector helps your agent workflow, please star the repo. Stars make the project easier for other AI builders to discover and help Delx keep shipping local-first wellness infrastructure.

## Why this exists

Strava holds the long memory of your training — every ride, run, swim, segment, route and stream. But it lives behind an OAuth API with strict rate limits (200 req/15min, 2k/day per app) and GPS data that's privacy-sensitive by default.

This package does the OAuth dance locally, throttles under Strava's per-app limits, redacts GPS lat/lng unless you explicitly opt in, and exposes Strava through the Model Context Protocol. Any MCP-compatible agent gets your training context with one config snippet. Tokens never leave your machine.

## Setup in 60 seconds

You'll need a Strava app ([create one here](https://www.strava.com/settings/api)) with redirect URI `http://127.0.0.1:3000/callback`.

```bash
npx -y strava-mcp-unofficial setup    # interactive: paste client id + secret
npx -y strava-mcp-unofficial auth     # opens browser, captures the OAuth code
npx -y strava-mcp-unofficial doctor   # verifies you're ready
```

`doctor` should report these scopes as granted:

```text
read activity:read_all profile:read_all
```

If only `read` is granted, re-run `auth`. Then add this to your MCP client config:

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

For Claude Desktop, run `setup --client claude` and the snippet is written for you.

## Try it with your agent

Three things to ask first:

```text
Use strava_connection_status to check setup, then run strava_daily_summary.
Tell me what my training context looks like in 5 lines.
```

```text
Call strava_weekly_summary with response_format=json. Find my biggest
load/intensity bottleneck and give me a next-week endurance plan.
```

```text
Use the strava_activity_stream_investigator prompt for activity_id=<id>.
Don't expose GPS unless I explicitly ask for it.
```

## Data availability

This package uses the official Strava API v3. When this README says `raw`, it means the upstream Strava JSON for a supported endpoint — not continuous device telemetry.

| Data | Available | Notes |
|---|:---:|---|
| Activities (runs, rides, swims, walks, workouts) | ✓ | All recorded activities |
| Activity details + zones + splits | ✓ | HR, power, cadence, elevation, gear |
| Activity streams (HR / cadence / watts / altitude) | ✓ | Per-second samples for the activity |
| GPS lat/lng streams | opt-in | Hidden by default; requires `include_gps=true` or `raw` mode |
| Athlete profile + zones + aggregate stats | ✓ | Authenticated athlete |
| Routes + clubs + gear | ✓ | Route geometry redacted in summary/structured modes |
| Live device telemetry / continuous HR | — | Not exposed by Strava's public API |

## Tools

**Start with these:**

- `strava_connection_status` — verify local setup, scopes and readiness before calling Strava
- `strava_data_inventory` — inventory supported data domains, scopes, privacy modes and recommended first calls without calling Strava APIs.
- `strava_daily_summary` — latest activity, weekly load and intensity context for today
- `strava_weekly_summary` — scorecard, comparison vs prior week, next-week training plan

**Auth & diagnostics**

- `strava_capabilities`, `strava_agent_manifest`, `strava_privacy_audit`, `strava_cache_status`
- `strava_get_auth_url`, `strava_exchange_code`, `strava_revoke_access`

**Athlete & training**

- `strava_get_athlete`, `strava_get_zones`, `strava_get_athlete_stats`

**Activities & streams**

- `strava_list_activities`, `strava_get_activity`, `strava_get_activity_zones`
- `strava_get_activity_streams` — GPS lat/lng requires `include_gps=true` or `raw` mode

**Routes & context**

- `strava_list_routes`, `strava_get_route`, `strava_list_clubs`, `strava_get_gear`

## Prompts

- `strava_daily_training_director` — practical daily training brief
- `strava_weekly_endurance_review` — week comparison + next-week endurance plan
- `strava_activity_stream_investigator` — investigate one activity using streams (GPS-aware)

Each accepts `timezone` (IANA, default `UTC`).

## Resources

- `strava://capabilities`, `strava://agent-manifest`
- `strava://athlete`
- `strava://latest/activity`
- `strava://summary/daily`, `strava://summary/weekly`

## Privacy & security

- OAuth tokens are stored in `~/.strava-mcp/tokens.json` with `0600` permissions and are never returned by tools.
- Write/upload scopes are **not** requested by default — read-only by design.
- GPS lat/lng is removed in `summary` mode, limited in `structured` mode, and only included with explicit `include_gps=true` or `raw` mode.
- Route geometry is also redacted unless raw mode is explicitly requested.
- The MCP client never sees access or refresh tokens.
- This is **not medical advice**. The server exposes user-authorized data for personal AI workflows, not diagnosis or training prescription.

## Configuration

`setup` writes most of these into `~/.strava-mcp/config.json` (`0600`). Manual env override is supported:

```bash
STRAVA_CLIENT_ID=…
STRAVA_CLIENT_SECRET=…
STRAVA_REDIRECT_URI=http://127.0.0.1:3000/callback

# Optional
STRAVA_SCOPES="read activity:read_all profile:read_all"
STRAVA_PRIVACY_MODE=structured        # summary | structured | raw
STRAVA_CACHE=sqlite                   # optional read-through cache
```

## Hermes / remote setup

```bash
npx -y strava-mcp-unofficial setup --client hermes --no-auth
npx -y strava-mcp-unofficial auth                       # run locally if browser auth is needed
npx -y strava-mcp-unofficial doctor --client hermes
hermes mcp test strava
```

Hermes commonly exposes Strava tools with a prefix:

- `mcp_strava_strava_agent_manifest`
- `mcp_strava_strava_connection_status`
- `mcp_strava_strava_daily_summary`
- `mcp_strava_strava_weekly_summary`
- `mcp_strava_strava_get_activity_streams`

After Hermes config changes, use `/reload-mcp` or `hermes mcp test strava`. Don't restart the gateway for normal data access.

If browser OAuth has to happen on a different machine than Hermes, run `auth` locally and copy `~/.strava-mcp/tokens.json` to the server with `chmod 600`. The token must include `activity:read_all profile:read_all read` for activity history and streams.

## Requirements

- Node.js 20+
- A Strava app with redirect URI `http://127.0.0.1:3000/callback`

Why these scopes:

- `read` — public profile, routes and public Strava resources
- `activity:read_all` — your activities, including private activities visible to your app
- `profile:read_all` — fuller authenticated athlete profile fields

No write scope is requested by default.

## Development

```bash
git clone https://github.com/davidmosiah/strava-mcp.git
cd strava-mcp
npm install
npm test
npm run build
```

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Links

- npm: <https://www.npmjs.com/package/strava-mcp-unofficial>
- Docs site: <https://wellness.delx.ai/connectors/strava>
- Legacy docs: <https://stravamcp.vercel.app/>
- GitHub Pages mirror: <https://davidmosiah.github.io/strava-mcp/>
- Delx Wellness registry: <https://github.com/davidmosiah/delx-wellness>
- Connector quality standard: <https://github.com/davidmosiah/delx-wellness/blob/main/docs/connector-quality-standard.md>
- Strava API docs: <https://developers.strava.com/docs/reference/>
- Strava auth docs: <https://developers.strava.com/docs/authentication/>

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This software is provided as-is. It is not a medical device, does not provide medical advice, and should not be used for diagnosis, treatment or training prescription. Always consult qualified professionals for medical or training concerns.
