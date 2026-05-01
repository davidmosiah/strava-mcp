# Privacy Model

Strava data can expose location, routines and sensitive training context. This MCP is local-first and conservative by default.

## Token Storage

OAuth tokens are stored locally at:

```text
~/.strava-mcp/tokens.json
```

The file is written with user-only permissions where supported.

## Privacy Modes

- `summary`: minimal activity/training fields. GPS/map fields removed.
- `structured`: normalized activity fields for analysis. Raw GPS geometry limited.
- `raw`: upstream Strava API payload. Use only when explicitly needed.

## GPS Boundary

Activity streams can include `latlng`. This MCP does not request or return GPS streams unless `include_gps=true` or `privacy_mode=raw` is explicitly used.

Routes and activity maps are also summarized by default instead of returning full geometry.

## Not Medical Advice

Strava is useful for training load, intensity, route and activity analysis. It is not a clinical recovery system. Pair it with sleep/recovery data before making aggressive changes.
