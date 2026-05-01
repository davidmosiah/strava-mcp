# Strava OAuth Setup

Create an app at <https://www.strava.com/settings/api>.

Recommended redirect URI:

```text
http://127.0.0.1:3000/callback
```

Recommended scopes:

```text
read activity:read_all profile:read_all
```

Run:

```bash
npx -y strava-mcp-unofficial setup
npx -y strava-mcp-unofficial auth
npx -y strava-mcp-unofficial doctor
```

The auth command starts a temporary local callback server, opens Strava, exchanges the returned code and saves tokens locally.
