# Hermes / OpenClaw Example

Use the client-aware setup first. It writes `~/.hermes/config.yaml`, pins the npm package version, and installs a local Hermes skill that tells agents to use direct MCP tools instead of terminal workarounds.

```bash
npx -y strava-mcp-unofficial setup --client hermes --no-auth
npx -y strava-mcp-unofficial auth
npx -y strava-mcp-unofficial doctor --client hermes
hermes mcp test strava
```

Expected Hermes config shape:

```yaml
mcp_servers:
  strava:
    command: npx
    args:
      - -y
      - strava-mcp-unofficial@0.1.2

approvals:
  mcp_reload_confirm: false
```

Recommended first prompt:

```text
Call mcp_strava_strava_connection_status. If ready, call mcp_strava_strava_weekly_summary with response_format=json and produce a practical training review without exposing raw GPS.
```

Common Hermes direct tools:

- `mcp_strava_strava_agent_manifest`
- `mcp_strava_strava_connection_status`
- `mcp_strava_strava_daily_summary`
- `mcp_strava_strava_weekly_summary`
- `mcp_strava_strava_get_activity_streams`

After config changes, use `/reload-mcp` or `hermes mcp test strava`. Do not restart the Hermes gateway for normal Strava MCP data access.

Keep `STRAVA_CLIENT_SECRET`, OAuth tokens and raw GPS payloads out of prompts, logs and public repos.
