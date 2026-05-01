import { buildConnectionStatus } from "../services/connection-status.js";
import { SERVER_VERSION } from "../constants.js";
import { runAuthCommand } from "./auth.js";
import { runSetupCommand } from "./setup.js";

export async function runCliCommand(args: string[]): Promise<number | undefined> {
  const [command, ...rest] = args;
  if (!command || command === "--http") return undefined;
  if (command === "setup") return runSetupCommand(rest);
  if (command === "doctor" || command === "status") return runDoctor(rest);
  if (command === "auth") return runAuthCommand(rest);
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(SERVER_VERSION);
    return 0;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (!command.startsWith("--")) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }
  return undefined;
}

async function runDoctor(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const status = await buildConnectionStatus();
  if (json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    printDoctor(status);
  }
  return strict && !status.ok ? 1 : 0;
}

function printDoctor(status: Awaited<ReturnType<typeof buildConnectionStatus>>): void {
  console.log("Strava MCP Doctor");
  console.log(`Status: ${status.ok ? "ready" : "needs setup"}`);
  console.log("");
  console.log("Checks:");
  console.log(`- Node.js >=20: ${status.node.supported ? "ok" : `needs update (${status.node.version})`}`);
  console.log(`- Strava env vars: ${status.missing_env.length === 0 ? "ok" : `missing ${status.missing_env.join(", ")}`}`);
  console.log(`- Local config: ${status.config.exists ? `${status.config.source} at ${status.config.path}` : "missing"}`);
  console.log(`- Automatic auth redirect: ${status.automatic_auth_supported ? "ok" : "not configured for local callback"}`);
  console.log(`- Token file: ${status.token.exists ? status.token.path : "missing"}`);
  if (status.token.exists) {
    console.log(`- Token permissions: ${status.token.secure_permissions === false ? "insecure" : "ok"}`);
    console.log(`- Refresh token: ${status.token.has_refresh_token ? "present" : "missing"}`);
  }
  console.log(`- OAuth scopes: ${status.oauth.scope_status}`);
  if (status.oauth.granted_scopes.length > 0) {
    console.log(`  granted: ${status.oauth.granted_scopes.join(" ")}`);
  }
  if (status.oauth.missing_recommended_scopes.length > 0) {
    console.log(`  missing recommended: ${status.oauth.missing_recommended_scopes.join(" ")}`);
  }
  console.log(`- Privacy mode: ${status.privacy_mode}`);
  console.log(`- Cache: ${status.cache.enabled ? `enabled at ${status.cache.path}` : "disabled"}`);
  console.log("");
  console.log("Next steps:");
  status.next_steps.forEach((step, index) => console.log(`${index + 1}. ${step}`));
}

function printHelp(): void {
  console.log(`Strava MCP Server

Usage:
  strava-mcp-server                 Start MCP stdio server
  strava-mcp-server --http          Start local HTTP MCP server
  strava-mcp-server setup           Guided setup, local config, and MCP client config
  strava-mcp-server doctor          Check setup and next steps
  strava-mcp-server doctor --json   Print setup status as JSON
  strava-mcp-server auth            Authorize Strava with local browser callback
  strava-mcp-server auth --no-open  Print auth URL without opening browser

Required env:
  STRAVA_CLIENT_ID
  STRAVA_CLIENT_SECRET
  STRAVA_REDIRECT_URI=http://127.0.0.1:3000/callback
`);
}
