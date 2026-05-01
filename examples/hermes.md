# Hermes / OpenClaw Example

Use the stdio package directly:

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

Recommended first prompt:

```text
Call strava_connection_status. If ready, call strava_weekly_summary with response_format=json and produce a practical training review without exposing raw GPS.
```

Keep `STRAVA_CLIENT_SECRET`, OAuth tokens and raw GPS payloads out of prompts, logs and public repos.
