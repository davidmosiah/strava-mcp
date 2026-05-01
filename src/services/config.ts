import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SCOPES } from "../constants.js";
import type { PrivacyMode, StravaConfig } from "../types.js";
import { loadConfigSources } from "./local-config.js";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getConfig(): StravaConfig {
  const sources = loadConfigSources(process.env, homedir());
  const value = (name: keyof typeof sources.values) => env(name) ?? sources.values[name];
  const clientId = value("STRAVA_CLIENT_ID");
  const clientSecret = value("STRAVA_CLIENT_SECRET");
  const redirectUri = value("STRAVA_REDIRECT_URI");
  const tokenPath = value("STRAVA_TOKEN_PATH") ?? join(homedir(), ".strava-mcp", "tokens.json");
  const cachePath = value("STRAVA_CACHE_PATH") ?? join(homedir(), ".strava-mcp", "cache.sqlite");
  const scopes = (value("STRAVA_SCOPES")?.split(/[ ,]+/).filter(Boolean)) ?? DEFAULT_SCOPES;
  const privacyMode = parsePrivacyMode(value("STRAVA_PRIVACY_MODE"));
  const cacheEnabled = parseBool(value("STRAVA_CACHE"), false);

  const missing = [
    ["STRAVA_CLIENT_ID", clientId],
    ["STRAVA_CLIENT_SECRET", clientSecret],
    ["STRAVA_REDIRECT_URI", redirectUri]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required STRAVA environment variables: ${missing.join(", ")}. ` +
      "Create an app at https://www.strava.com/settings/api and set these variables before using Strava tools."
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    scopes,
    tokenPath,
    privacyMode,
    cacheEnabled,
    cachePath
  };
}

function parsePrivacyMode(value: string | undefined): PrivacyMode {
  if (value === "summary" || value === "structured" || value === "raw") return value;
  return "structured";
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on", "sqlite"].includes(value.toLowerCase());
}
