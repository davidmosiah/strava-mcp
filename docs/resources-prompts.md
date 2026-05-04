# Resources And Prompts

## Resources

- `strava://agent-manifest`
- `strava://capabilities`
- `strava://athlete`
- `strava://latest/activity`
- `strava://summary/daily`
- `strava://summary/weekly`

## Prompts

- `strava_daily_training_director`
- `strava_weekly_endurance_review`
- `strava_activity_stream_investigator`

Agents should read `strava://agent-manifest` or call `strava_agent_manifest` before installation/client work. For training work, use workflow summaries first, then drill into activity streams only when a specific activity needs investigation.
