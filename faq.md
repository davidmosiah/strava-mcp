# FAQ

## Is this official?

No. This is an unofficial open-source project and is not affiliated with Strava, Inc.

## Does it use the official Strava API?

Yes. It uses Strava API v3 and OAuth2.

## Does it fetch raw sensor data?

It can fetch Strava activity streams such as time, distance, heartrate, cadence, watts, altitude, temperature and GPS lat/lng when available. These are activity streams tied to recorded activities, not continuous 24/7 raw device telemetry.

## Why is GPS handled carefully?

Routes can reveal home, work, habits and routines. Summary mode removes GPS/map fields, structured mode limits geometry, and raw/GPS stream access requires explicit intent.

## Can it upload activities?

Not by default. This project is read-only by design. Write/upload tools would need explicit opt-in and stronger safety gates.

## What should an agent call first?

Start with `strava_capabilities`, then `strava_connection_status`, then `strava_daily_summary` or `strava_weekly_summary`.
