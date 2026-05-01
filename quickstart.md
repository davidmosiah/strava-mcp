# Quickstart

## 1. Create A Strava App

Open <https://www.strava.com/settings/api> and create an application.

Use this callback domain / redirect URI pattern:

```text
127.0.0.1
http://127.0.0.1:3000/callback
```

Strava allows localhost and `127.0.0.1` for OAuth callbacks.

## 2. Install

```bash
npx -y strava-mcp-unofficial setup
npx -y strava-mcp-unofficial auth
npx -y strava-mcp-unofficial doctor
```

`setup` stores your Strava app credentials in `~/.strava-mcp/config.json` with `0600` permissions.

## 3. Scopes

Recommended read-only scopes:

```text
read activity:read_all profile:read_all
```

No write/upload scope is required.

## 4. MCP Client Config

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

## 5. First Agent Call

Ask your agent:

```text
Call strava_connection_status. If ready, call strava_daily_summary with response_format=json and give me a practical training plan for today.
```
