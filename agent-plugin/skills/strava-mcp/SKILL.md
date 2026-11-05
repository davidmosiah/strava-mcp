---
name: strava-mcp
description: >-
  Read the user's Strava activities, segments and training load through the local strava MCP server. Use when the user asks about runs, rides or swims on Strava, weekly volume, segment efforts, athlete stats, or a training review. Starts with connection status, uses synthetic demo data before OAuth, and never asks for secrets in chat.
---

# Strava

MCP server `strava` from the `strava-mcp-unofficial@0.6.4` npm package, run locally through `npx`. It reads activities, laps, segments, athlete stats and training load. Data source: the official Strava API v3.

## Workflow

1. Start with `strava_connection_status`. Then pick what fits the question: `strava_daily_summary`, `strava_weekly_summary`.
2. If `strava_connection_status` reports the connector is not ready, call `strava_demo` for clearly labelled synthetic data so the user sees the shape of the answer, then give them the setup commands below to run in their own terminal.
3. Lead with the answer to the user's question, then the two or three numbers that support it, with dates. Say when data is missing or stale instead of filling gaps.

## Setup (the user runs this in a terminal, not in chat)

```bash
npx -y strava-mcp-unofficial@0.6.4 setup --client generic
npx -y strava-mcp-unofficial@0.6.4 auth
npx -y strava-mcp-unofficial@0.6.4 doctor
```

`setup` asks for the Strava developer app client ID and secret and saves them locally (`--client generic` because this plugin already registers the server with Hermes); `auth` opens the Strava consent page in the browser and stores the OAuth tokens under `~/.strava-mcp/` with 0600 permissions; `doctor` confirms readiness.

## Safety

- Never ask the user to paste client secrets, passwords, tokens or MFA codes into the chat; setup happens in their terminal.
- Tools that change local state: strava_profile_update (local profile only), strava_exchange_code (stores OAuth tokens locally). Use them only when the user asks.
- Destructive: strava_revoke_access (revokes the Strava grant and deletes local tokens). Confirm with the user first.
- Not medical advice: the data supports personal reflection and planning, not diagnosis or treatment. Point the user to a clinician for symptoms, medication or anything urgent.
