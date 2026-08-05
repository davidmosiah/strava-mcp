# FAQ

## Is this official?

No. This is an unofficial open-source project and is not affiliated with Strava, Inc.

## Does it use the official Strava API?

Yes. It uses Strava API v3 and OAuth2.

## Does it fetch raw sensor data?

It can fetch Strava activity streams such as time, distance, heartrate, cadence, watts, altitude, temperature and GPS lat/lng when available. These are activity streams tied to recorded activities, not continuous 24/7 raw device telemetry.

For agent work prefer **`strava_activity_series`** (`agent-safe-series/v1`): exact full-resolution stats plus a hard-capped downsampled series so a multi-hour ride never blows the context window. Shared shape with Garmin MCP and Mi Fitness Data Bridge (Kindred) — see [garmin-mcp#19](https://github.com/davidmosiah/garmin-mcp/issues/19). Use `strava_get_activity_streams` only when you need multi-key raw streams or GPS with explicit consent.

## Why is GPS handled carefully?

Routes can reveal home, work, habits and routines. Summary mode removes GPS/map fields, structured mode limits geometry, and raw/GPS stream access requires explicit intent. Series tools never include latlng.

## Can it upload activities?

Not by default. This project is read-only by design. Write/upload tools would need explicit opt-in and stronger safety gates.

## What should an agent call first?

Start with `strava_agent_manifest`, then `strava_connection_status`, then `strava_daily_summary` or `strava_weekly_summary`. For one activity's effort shape, use `strava_activity_series` before raw streams.

## What should Hermes call?

Hermes often prefixes MCP tools by server name. Use direct tools such as `mcp_strava_strava_connection_status`, `mcp_strava_strava_daily_summary`, `mcp_strava_strava_weekly_summary`, and `mcp_strava_strava_activity_series`. After config changes, use `/reload-mcp` or `hermes mcp test strava`; do not restart the gateway for normal Strava data access.
