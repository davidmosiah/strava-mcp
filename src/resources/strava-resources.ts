import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildAgentManifest } from "../services/agent-manifest.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildDataInventory } from "../services/inventory.js";
import { getConfig } from "../services/config.js";
import { applyPrivacy, resolvePrivacyMode } from "../services/privacy.js";
import { buildDailySummary, buildWeeklySummary } from "../services/summary.js";
import { StravaClient } from "../services/strava-client.js";

function jsonResource(uri: URL, data: unknown) {
  return {
    contents: [{
      uri: uri.toString(),
      mimeType: "application/json",
      text: JSON.stringify(data, null, 2)
    }]
  };
}

async function athleteResource(uri: URL) {
  const config = getConfig();
  const privacyMode = resolvePrivacyMode(config);
  const endpoint = "/athlete";
  const data = applyPrivacy(endpoint, await new StravaClient(config).get(endpoint), privacyMode);
  return jsonResource(uri, { endpoint, privacy_mode: privacyMode, data });
}

async function latestActivityResource(uri: URL) {
  const config = getConfig();
  const privacyMode = resolvePrivacyMode(config);
  const endpoint = "/athlete/activities";
  const result = await new StravaClient(config).list(endpoint, { limit: 1 });
  const data = applyPrivacy(endpoint, { records: result.records }, privacyMode) as Record<string, unknown>;
  return jsonResource(uri, { endpoint, privacy_mode: privacyMode, ...data });
}

export function registerStravaResources(server: McpServer): void {
  server.registerResource("strava_data_inventory", "strava://inventory", { title: "Strava Data Inventory", description: "Static inventory of supported Strava data domains, privacy modes and recommended first calls.", mimeType: "application/json" }, async (uri) => jsonResource(uri, buildDataInventory()));
  server.registerResource(
    "strava_agent_manifest_resource",
    "strava://agent-manifest",
    {
      title: "Strava Agent Manifest",
      description: "Static machine-readable install and runtime instructions for AI agents, including Hermes direct tool names.",
      mimeType: "application/json"
    },
    async (uri) => jsonResource(uri, buildAgentManifest("hermes"))
  );

  server.registerResource(
    "strava_capabilities_resource",
    "strava://capabilities",
    {
      title: "Strava MCP Capabilities",
      description: "Static capabilities, API boundary, GPS privacy modes and recommended agent workflow.",
      mimeType: "application/json"
    },
    async (uri) => jsonResource(uri, buildCapabilities())
  );

  server.registerResource(
    "strava_athlete",
    "strava://athlete",
    {
      title: "Strava Athlete",
      description: "Authenticated athlete using the configured privacy mode.",
      mimeType: "application/json"
    },
    athleteResource
  );

  server.registerResource(
    "strava_latest_activity",
    "strava://latest/activity",
    {
      title: "Latest Strava Activity",
      description: "Latest activity using the configured privacy mode.",
      mimeType: "application/json"
    },
    latestActivityResource
  );

  server.registerResource(
    "strava_daily_summary_resource",
    "strava://summary/daily",
    {
      title: "Strava Daily Training Summary",
      description: "Daily activity load and action-candidate summary.",
      mimeType: "application/json"
    },
    async (uri) => {
      const summary = await buildDailySummary(new StravaClient(getConfig()), { days: 7, timezone: "UTC" });
      return jsonResource(uri, summary);
    }
  );

  server.registerResource(
    "strava_weekly_summary_resource",
    "strava://summary/weekly",
    {
      title: "Strava Weekly Training Review",
      description: "Weekly volume, intensity, sport mix, bottlenecks and next-week actions.",
      mimeType: "application/json"
    },
    async (uri) => {
      const summary = await buildWeeklySummary(new StravaClient(getConfig()), { days: 7, compare_days: 7, timezone: "UTC" });
      return jsonResource(uri, summary);
    }
  );
}
