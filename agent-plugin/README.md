# Strava — Agent Plugins package

Portable [Agent Plugins](https://agent-plugins.org/) v1 package for
[Hermes Agent](https://github.com/NousResearch/hermes-agent) and other Agent Plugins clients:
the `strava` MCP server (`strava-mcp-unofficial@0.7.0` over stdio) plus the `strava-mcp` workflow skill.

## Install (Hermes Agent)

```bash
hermes plugins install davidmosiah/strava-mcp/agent-plugin --no-enable
hermes plugins enable strava-mcp
```

Requires Node.js 20+ (`npx` on PATH). The skill loads as `strava-mcp:strava-mcp`.

## Connector setup

```bash
npx -y strava-mcp-unofficial@0.7.0 setup --client generic
npx -y strava-mcp-unofficial@0.7.0 auth
npx -y strava-mcp-unofficial@0.7.0 doctor
```

`setup` asks for the Strava developer app client ID and secret and saves them locally (`--client generic` because this plugin already registers the server with Hermes); `auth` opens the Strava consent page in the browser and stores the OAuth tokens under `~/.strava-mcp/` with 0600 permissions; `doctor` confirms readiness.

## Disclosure

Runs the `strava-mcp-unofficial@0.7.0` npm package locally over stdio through `npx` (Node.js 20+ required); the package is downloaded from npm on first start. Data source: the official Strava API v3. Credentials and OAuth tokens are created by the connector's own `setup`/`auth` commands in the user's terminal and stay on the machine (`~/.strava-mcp/`); the plugin declares no environment variables and reads no Hermes credentials. Tools that change state: strava_profile_update (local profile only); strava_exchange_code (stores OAuth tokens locally); strava_revoke_access (revokes the Strava grant and deletes local tokens). The tool set comes from the pinned npm version, not from this repository's source tree.

## Upgrading an existing client

Review the [migration guide](../docs/migration-0.7.0.md) before upgrading. Authenticated response caching and offline cache fallback are disabled; upgrading does not erase historical cache files. Profiles reject invalid values, files over 256 KiB and symlinks. Tool inputs are limited to 10,000 elements. The stdio launcher, Node.js 20+ requirement and user-run authorization flow are unchanged. Restart the client and check the reported version, doctor output and synthetic demo before using an account.

`${PLUGIN_DATA}` sets the working directory, not an account boundary. Provider configuration and tokens still use the user home; the wellness profile is shared at `~/.delx-wellness/profile.json`. Keep separate identities in separate operating-system homes. This plugin update does not authorize an account or migrate credentials.
