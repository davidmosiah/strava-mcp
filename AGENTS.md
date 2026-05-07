# Agent Development Notes

## Scope

This repo is the unofficial Strava MCP connector for local activity and training agents.

## Commands

- Install: `npm ci`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Fast smoke: `npm run smoke`
- HTTP smoke: `npm run smoke:http`
- Full gate: `npm test`

## Rules

- Never commit OAuth client secrets, access tokens, refresh tokens, activity exports with private location data, or local config.
- Keep read-only behavior and privacy-safe summaries as the default.
- Preserve agent-ready surfaces: manifest, connection status, privacy audit, CLI UX, Hermes agent manifest, and metadata checks.
- Treat route/location data as sensitive.
