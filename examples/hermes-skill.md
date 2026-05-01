# Strava MCP Hermes Skill

This is the skill content that `strava-mcp-server setup --client hermes` writes to `~/.hermes/skills/strava-mcp/SKILL.md`.

```markdown
# Strava MCP

Use this skill whenever a user asks Hermes to inspect Strava training, routes, activity streams, daily summaries or weekly summaries through the Strava MCP.

## Runtime Contract

- Prefer direct MCP tools exposed by Hermes.
- Start every Strava task with `mcp_strava_strava_connection_status` unless the user only asks for installation help.
- Use `mcp_strava_strava_agent_manifest` when you need machine-readable install or client instructions.
- Do not use terminal, Python, curl or npm as a workaround for normal Strava data access when MCP tools are available.
- After editing `/root/.hermes/config.yaml` or `~/.hermes/config.yaml`, reload MCP with `/reload-mcp` or `hermes mcp test strava`.
- Do not restart the Hermes gateway for normal Strava MCP config/data access. Restart only when Hermes itself is unhealthy.
- Never print Strava client secrets, access tokens or refresh tokens.
- Treat GPS, route geometry and raw streams as sensitive. Ask for explicit user consent before requesting raw GPS or `latlng` streams.

## First Calls

1. `mcp_strava_strava_connection_status`
2. `mcp_strava_strava_daily_summary` for today's context
3. `mcp_strava_strava_weekly_summary` for load trends
4. `mcp_strava_strava_get_activity_streams` only for a specific activity investigation
```
