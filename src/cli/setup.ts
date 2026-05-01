import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface as createCallbackInterface } from "node:readline";
import { createInterface as createPromptInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { DEFAULT_SCOPES } from "../constants.js";
import { writeLocalConfig, type LocalStravaConfig } from "../services/local-config.js";
import { runAuthCommand } from "./auth.js";

type ClientName = "generic" | "claude" | "cursor" | "windsurf" | "hermes" | "openclaw";

interface SetupOptions {
  client: ClientName;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  privacyMode: "summary" | "structured" | "raw";
  cache?: string;
  tokenPath?: string;
  cachePath?: string;
  noAuth: boolean;
  json: boolean;
  homeDir: string;
}

export async function runSetupCommand(args: string[]): Promise<number> {
  const options = await parseSetupOptions(args);
  const config: LocalStravaConfig = {
    STRAVA_CLIENT_ID: options.clientId,
    STRAVA_CLIENT_SECRET: options.clientSecret,
    STRAVA_REDIRECT_URI: options.redirectUri,
    STRAVA_SCOPES: DEFAULT_SCOPES.join(" "),
    STRAVA_PRIVACY_MODE: options.privacyMode
  };
  if (options.cache) config.STRAVA_CACHE = options.cache;
  if (options.tokenPath) config.STRAVA_TOKEN_PATH = options.tokenPath;
  if (options.cachePath) config.STRAVA_CACHE_PATH = options.cachePath;

  const configPath = writeLocalConfig(config, options.homeDir);
  const clientConfigPath = writeClientConfig(options.client, options.homeDir);
  const setupOutput = {
    ok: true,
    config_path: configPath,
    client: options.client,
    client_config_path: clientConfigPath,
    auth_started: !options.noAuth,
    next_step: options.noAuth ? "Run `strava-mcp-server auth`, then `strava-mcp-server doctor`." : "Run `strava-mcp-server doctor`."
  };

  if (options.json) console.log(JSON.stringify(setupOutput, null, 2));
  else {
    console.log("Strava MCP setup saved.");
    console.log(`Local config: ${configPath}`);
    console.log(`MCP client config: ${clientConfigPath}`);
    console.log("Secrets were saved only in the local Strava MCP config file.");
  }

  if (!options.noAuth) {
    return runAuthCommand(options.json ? ["--json"] : []);
  }
  return 0;
}

async function parseSetupOptions(args: string[]): Promise<SetupOptions> {
  const flags = parseFlags(args);
  const json = flags.has("json");
  const homeDir = flags.get("home-dir") ?? homedir();
  const interactive = !json && !flags.has("non-interactive") && process.stdin.isTTY;

  const answers = interactive ? await promptForMissing(flags) : flags;
  const client = parseClient(answers.get("client") ?? "generic");
  const clientId = required(answers, "client-id", "Strava Client ID");
  const clientSecret = required(answers, "client-secret", "Strava Client Secret");
  const redirectUri = answers.get("redirect-uri") ?? "http://127.0.0.1:3000/callback";
  const privacyMode = parsePrivacyMode(answers.get("privacy-mode") ?? "structured");
  const cache = answers.get("cache");

  return {
    client,
    clientId,
    clientSecret,
    redirectUri,
    privacyMode,
    cache,
    tokenPath: answers.get("token-path"),
    cachePath: answers.get("cache-path"),
    noAuth: flags.has("no-auth"),
    json,
    homeDir
  };
}

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(name, "true");
    } else {
      flags.set(name, next);
      index += 1;
    }
  }
  return flags;
}

async function promptForMissing(flags: Map<string, string>): Promise<Map<string, string>> {
  const merged = new Map(flags);
  const firstPrompt = createPromptInterface({ input, output });
  try {
    if (!merged.has("client")) merged.set("client", (await firstPrompt.question("MCP client (generic/claude/cursor/windsurf/hermes/openclaw) [generic]: ")).trim() || "generic");
    if (!merged.has("client-id")) merged.set("client-id", (await firstPrompt.question("Strava Client ID: ")).trim());
  } finally {
    firstPrompt.close();
  }
  if (!merged.has("client-secret")) merged.set("client-secret", await promptHidden("Strava Client Secret: "));

  const secondPrompt = createPromptInterface({ input, output });
  try {
    if (!merged.has("redirect-uri")) merged.set("redirect-uri", (await secondPrompt.question("Strava Redirect URI [http://127.0.0.1:3000/callback]: ")).trim() || "http://127.0.0.1:3000/callback");
    if (!merged.has("privacy-mode")) merged.set("privacy-mode", (await secondPrompt.question("Privacy mode (summary/structured/raw) [structured]: ")).trim() || "structured");
  } finally {
    secondPrompt.close();
  }
  return merged;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createCallbackInterface({ input, output, terminal: true }) as ReturnType<typeof createCallbackInterface> & {
      stdoutMuted?: boolean;
      _writeToOutput?: (text: string) => void;
    };
    const originalWrite = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (text: string) => {
      if (rl.stdoutMuted && text !== "\n" && text !== "\r\n") output.write("*");
      else if (originalWrite) originalWrite(text);
      else output.write(text);
    };
    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      rl.close();
      output.write("\n");
      resolve(answer.trim());
    });
  });
}

function required(flags: Map<string, string>, key: string, label: string): string {
  const value = flags.get(key);
  if (!value || value === "true") throw new Error(`${label} is required. Pass --${key} or run setup interactively.`);
  return value;
}

function parseClient(value: string): ClientName {
  if (["generic", "claude", "cursor", "windsurf", "hermes", "openclaw"].includes(value)) return value as ClientName;
  throw new Error(`Unsupported client: ${value}. Use generic, claude, cursor, windsurf, hermes or openclaw.`);
}

function parsePrivacyMode(value: string): "summary" | "structured" | "raw" {
  if (value === "summary" || value === "structured" || value === "raw") return value;
  throw new Error("Privacy mode must be summary, structured or raw.");
}

function writeClientConfig(client: ClientName, homeDir: string): string {
  if (client === "claude") return mergeClaudeConfig(homeDir);
  const path = join(homeDir, ".strava-mcp", "mcp-configs", `${client}.json`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(mcpConfigSnippet(), null, 2)}\n`, { mode: 0o600 });
  return path;
}

function mergeClaudeConfig(homeDir: string): string {
  const path = process.platform === "darwin"
    ? join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    : join(homeDir, ".strava-mcp", "mcp-configs", "claude-desktop.json");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const mcpServers = typeof existing.mcpServers === "object" && existing.mcpServers ? existing.mcpServers as Record<string, unknown> : {};
  const next = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      strava: mcpConfigSnippet().mcpServers.strava
    }
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function mcpConfigSnippet() {
  return {
    mcpServers: {
      strava: {
        command: "npx",
        args: ["-y", "strava-mcp-unofficial"]
      }
    }
  };
}
