import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ActivityStreamsInputSchema,
  AuthUrlInputSchema,
  AuthUrlOutputSchema,
  CacheStatusOutputSchema,
  CapabilitiesOutputSchema,
  CollectionInputSchema,
  CollectionOutputSchema,
  ConnectionStatusOutputSchema,
  DailySummaryInputSchema,
  EndpointDataOutputSchema,
  ExchangeCodeInputSchema,
  ExchangeCodeOutputSchema,
  IdInputSchema,
  PrivacyAuditOutputSchema,
  RevokeAccessOutputSchema,
  ResponseOnlyInputSchema,
  SimpleReadInputSchema,
  SummaryOutputSchema,
  WeeklySummaryInputSchema
} from "../schemas/common.js";
import { buildPrivacyAudit } from "../services/audit.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildConnectionStatus } from "../services/connection-status.js";
import { getConfig } from "../services/config.js";
import { bulletList, formatCollection, makeError, makeResponse } from "../services/format.js";
import { applyPrivacy, normalizeStreams, resolvePrivacyMode } from "../services/privacy.js";
import { buildDailySummary, buildWeeklySummary, formatSummaryMarkdown } from "../services/summary.js";
import { StravaClient } from "../services/strava-client.js";

function client(): StravaClient {
  return new StravaClient(getConfig());
}

async function athleteId(api: StravaClient): Promise<string | number> {
  const athlete = await api.get("/athlete") as { id?: string | number };
  if (!athlete.id) throw new Error("Authenticated Strava athlete id was not returned. Re-authorize and try again.");
  return athlete.id;
}

function registerCollectionTool(server: McpServer, name: string, title: string, endpoint: string | ((api: StravaClient) => Promise<string>), description: string): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: CollectionInputSchema.shape,
      outputSchema: CollectionOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const config = getConfig();
        const api = new StravaClient(config);
        const privacyMode = resolvePrivacyMode(config, params.privacy_mode);
        const resolvedEndpoint = typeof endpoint === "function" ? await endpoint(api) : endpoint;
        const result = await api.list(resolvedEndpoint, params);
        const records = applyPrivacy(resolvedEndpoint, { records: result.records }, privacyMode) as { records: unknown[] };
        const output = {
          endpoint: resolvedEndpoint,
          privacy_mode: privacyMode,
          count: records.records.length,
          records: records.records,
          next_page: result.next_page,
          has_more: Boolean(result.next_page),
          pages_fetched: result.pages_fetched
        };
        return makeResponse(output, params.response_format, formatCollection(title, records.records, output));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );
}

function registerGetByIdTool(server: McpServer, name: string, title: string, endpointBuilder: (id: string | number) => string, description: string): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: IdInputSchema.shape,
      outputSchema: EndpointDataOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const config = getConfig();
        const privacyMode = resolvePrivacyMode(config, params.privacy_mode);
        const endpoint = endpointBuilder(params.id);
        const data = applyPrivacy(endpoint, await new StravaClient(config).get(endpoint), privacyMode);
        return makeResponse({ endpoint, privacy_mode: privacyMode, data }, params.response_format, bulletList(title, { endpoint, privacy_mode: privacyMode, data: JSON.stringify(data) }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );
}

export function registerStravaTools(server: McpServer): void {
  server.registerTool(
    "strava_capabilities",
    {
      title: "Strava MCP Capabilities",
      description: "Explain supported Strava data, privacy boundaries, GPS handling, recommended agent workflow and project links. Does not call Strava or expose secrets.",
      inputSchema: ResponseOnlyInputSchema.shape,
      outputSchema: CapabilitiesOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format }) => {
      const capabilities = buildCapabilities();
      return makeResponse(capabilities, response_format, bulletList("Strava MCP Capabilities", {
        project: capabilities.project,
        unofficial: capabilities.unofficial,
        api_boundary: capabilities.api_boundary.source,
        raw_definition: capabilities.api_boundary.raw_definition,
        recommended_first_tools: "strava_connection_status, strava_daily_summary, strava_weekly_summary",
        docs: capabilities.links.docs
      }));
    }
  );

  server.registerTool(
    "strava_get_auth_url",
    {
      title: "Get Strava OAuth URL",
      description: "Generate a Strava OAuth authorization URL. Use this first when no local token exists.",
      inputSchema: AuthUrlInputSchema.shape,
      outputSchema: AuthUrlOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (params) => {
      try {
        const config = getConfig();
        const url = new StravaClient(config).authUrl(params.state, params.scopes);
        const output = {
          auth_url: url,
          redirect_uri: config.redirectUri,
          scopes: params.scopes?.length ? params.scopes : config.scopes,
          next_step: "Open auth_url, approve access, then pass the returned code or full redirect URL to strava_exchange_code."
        };
        return makeResponse(output, params.response_format, bulletList("Strava OAuth URL", output));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "strava_exchange_code",
    {
      title: "Exchange Strava OAuth Code",
      description: "Exchange a Strava OAuth authorization code for local tokens. Tokens are stored locally with 0600 permissions and are never returned.",
      inputSchema: ExchangeCodeInputSchema.shape,
      outputSchema: ExchangeCodeOutputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async (params) => {
      try {
        const result = await client().exchangeCode(params.code);
        const output = { ...result, note: "Token values were stored locally and intentionally omitted from this response." };
        return makeResponse(output, params.response_format, bulletList("Strava OAuth Exchange", output));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "strava_get_athlete",
    {
      title: "Get Authenticated Athlete",
      description: "Get the authenticated Strava athlete profile. Requires read/profile scope depending on requested fields.",
      inputSchema: SimpleReadInputSchema.shape,
      outputSchema: EndpointDataOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ response_format, privacy_mode }) => {
      try {
        const config = getConfig();
        const endpoint = "/athlete";
        const privacyMode = resolvePrivacyMode(config, privacy_mode);
        const data = applyPrivacy(endpoint, await new StravaClient(config).get(endpoint), privacyMode);
        return makeResponse({ endpoint, privacy_mode: privacyMode, data }, response_format, bulletList("Strava Athlete", data as Record<string, unknown>));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "strava_get_zones",
    {
      title: "Get Athlete Zones",
      description: "Get the authenticated athlete heart-rate and power zones when available.",
      inputSchema: SimpleReadInputSchema.shape,
      outputSchema: EndpointDataOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ response_format, privacy_mode }) => {
      try {
        const config = getConfig();
        const endpoint = "/athlete/zones";
        const privacyMode = resolvePrivacyMode(config, privacy_mode);
        const data = applyPrivacy(endpoint, await new StravaClient(config).get(endpoint), privacyMode);
        return makeResponse({ endpoint, privacy_mode: privacyMode, data }, response_format, bulletList("Strava Zones", { data: JSON.stringify(data) }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "strava_get_athlete_stats",
    {
      title: "Get Athlete Stats",
      description: "Get public-visible aggregate Strava stats for the authenticated athlete.",
      inputSchema: SimpleReadInputSchema.shape,
      outputSchema: EndpointDataOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ response_format, privacy_mode }) => {
      try {
        const config = getConfig();
        const api = new StravaClient(config);
        const id = await athleteId(api);
        const endpoint = `/athletes/${id}/stats`;
        const privacyMode = resolvePrivacyMode(config, privacy_mode);
        const data = applyPrivacy(endpoint, await api.get(endpoint), privacyMode);
        return makeResponse({ endpoint, privacy_mode: privacyMode, data }, response_format, bulletList("Strava Athlete Stats", { athlete_id: id, data: JSON.stringify(data) }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  registerCollectionTool(server, "strava_list_activities", "Strava Activities", "/athlete/activities", "List authenticated athlete activities. Supports after/before filters and Strava pagination. Requires activity:read or activity:read_all.");
  registerCollectionTool(server, "strava_list_routes", "Strava Routes", async (api) => `/athletes/${await athleteId(api)}/routes`, "List authenticated athlete routes. GPS/map geometry is redacted unless raw mode is requested.");
  registerCollectionTool(server, "strava_list_clubs", "Strava Clubs", "/athlete/clubs", "List clubs joined by the authenticated athlete.");

  registerGetByIdTool(server, "strava_get_activity", "Strava Activity", (id) => `/activities/${id}`, "Get detailed activity data by id. Summary/structured modes protect raw GPS details.");
  registerGetByIdTool(server, "strava_get_activity_zones", "Strava Activity Zones", (id) => `/activities/${id}/zones`, "Get heart-rate/power zones for an activity when available.");
  registerGetByIdTool(server, "strava_get_route", "Strava Route", (id) => `/routes/${id}`, "Get route details by id. Summary/structured modes avoid full route geometry.");
  registerGetByIdTool(server, "strava_get_gear", "Strava Gear", (id) => `/gear/${id}`, "Get gear/equipment details by id.");

  server.registerTool(
    "strava_get_activity_streams",
    {
      title: "Get Activity Streams",
      description: "Get Strava activity streams such as time, distance, heartrate, cadence, watts and altitude. GPS latlng is withheld unless include_gps=true or privacy_mode=raw.",
      inputSchema: ActivityStreamsInputSchema.shape,
      outputSchema: EndpointDataOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const config = getConfig();
        const privacyMode = resolvePrivacyMode(config, params.privacy_mode);
        const keys = params.keys.filter((key) => key !== "latlng" || params.include_gps || privacyMode === "raw");
        const endpoint = `/activities/${params.id}/streams`;
        const raw = await new StravaClient(config).get(endpoint, {
          keys: keys.join(","),
          key_by_type: true,
          resolution: params.resolution
        });
        const data = normalizeStreams(raw, privacyMode, params.include_gps);
        return makeResponse({ endpoint, privacy_mode: privacyMode, data }, params.response_format, bulletList("Strava Activity Streams", { endpoint, keys: keys.join(","), privacy_mode: privacyMode, data: JSON.stringify(data) }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "strava_connection_status",
    {
      title: "Strava Connection Status",
      description: "Check local Strava config, token file, Node version, privacy mode and cache readiness without calling Strava or exposing secrets.",
      inputSchema: ResponseOnlyInputSchema.shape,
      outputSchema: ConnectionStatusOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format }) => {
      const status = await buildConnectionStatus();
      return makeResponse(status, response_format, bulletList("Strava Connection Status", {
        ok: status.ok,
        ready_for_strava_api: status.ready_for_strava_api,
        missing_env: status.missing_env.join(", ") || "none",
        token_path: status.token.path,
        token_exists: status.token.exists,
        privacy_mode: status.privacy_mode,
        next_steps: status.next_steps.join(" | ")
      }));
    }
  );

  server.registerTool("strava_cache_status", {
    title: "Strava Cache Status",
    description: "Show optional local SQLite cache status. Enable with STRAVA_CACHE=sqlite or STRAVA_CACHE=true.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: CacheStatusOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    try {
      const status = client().cacheStatus();
      return makeResponse(status, response_format, bulletList("Strava Cache Status", status));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("strava_privacy_audit", {
    title: "Strava Privacy Audit",
    description: "Return local privacy, cache, token-path, GPS redaction and env-presence posture without revealing secret values.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: PrivacyAuditOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const audit = buildPrivacyAudit();
    return makeResponse(audit, response_format, bulletList("Strava Privacy Audit", audit));
  });

  server.registerTool("strava_revoke_access", {
    title: "Revoke Strava OAuth Access",
    description: "Revoke the current Strava OAuth access grant and delete the local token file. Use only when the user explicitly wants to disconnect Strava.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: RevokeAccessOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }, async ({ response_format }) => {
    try {
      const result = await client().revokeAccess();
      const output = { ...result, note: "Strava access was revoked and local tokens were removed. Re-authorize before future API calls." };
      return makeResponse(output, response_format, bulletList("Strava Access Revoked", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("strava_daily_summary", {
    title: "Strava Daily Training Summary",
    description: "Build a practical daily training/load summary from recent Strava activities. Read-only and non-medical.",
    inputSchema: DailySummaryInputSchema.shape,
    outputSchema: SummaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const summary = await buildDailySummary(client(), params);
      return makeResponse(summary, params.response_format, formatSummaryMarkdown(summary));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("strava_weekly_summary", {
    title: "Strava Weekly Training Review",
    description: "Build a weekly Strava scorecard with volume, intensity, sport mix, bottlenecks and next-week actions. Read-only and non-medical.",
    inputSchema: WeeklySummaryInputSchema.shape,
    outputSchema: SummaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const summary = await buildWeeklySummary(client(), params);
      return makeResponse(summary, params.response_format, formatSummaryMarkdown(summary));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });
}
