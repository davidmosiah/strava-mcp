import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ActivityStreamsInputSchema,
  AgentManifestInputSchema,
  AgentManifestOutputSchema,
  AuthUrlInputSchema,
  AuthUrlOutputSchema,
  CacheStatusOutputSchema,
  CapabilitiesOutputSchema,
  CollectionInputSchema,
  CollectionOutputSchema,
  ConnectionStatusInputSchema,
  ConnectionStatusOutputSchema,
  DailySummaryInputSchema,
  DataInventoryOutputSchema,
  EndpointDataOutputSchema,
  ExchangeCodeInputSchema,
  ExchangeCodeOutputSchema,
  IdInputSchema,
  PrivacyAuditOutputSchema,
  ResponseFormatSchema,
  ResponseOnlyInputSchema,
  RevokeAccessOutputSchema,
  SimpleReadInputSchema,
  SummaryOutputSchema,
  TrainingContextInputSchema,
  TrainingContextOutputSchema,
  WeeklySummaryInputSchema
} from "../schemas/common.js";
import { buildPrivacyAudit } from "../services/audit.js";
import { buildAgentManifest, formatAgentManifestMarkdown } from "../services/agent-manifest.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildDataInventory, formatInventoryMarkdown } from "../services/inventory.js";
import { buildConnectionStatus } from "../services/connection-status.js";
import { getConfig } from "../services/config.js";
import { bulletList, formatCollection, makeError, makeResponse } from "../services/format.js";
import { applyPrivacy, normalizeStreams, resolvePrivacyMode } from "../services/privacy.js";
import { buildDailySummary, buildWeeklySummary, formatSummaryMarkdown } from "../services/summary.js";
import { buildTrainingContext, formatTrainingContextMarkdown } from "../services/context.js";
import { StravaClient } from "../services/strava-client.js";
import {
  buildProfileSummary,
  getOnboardingFlow,
  getProfile,
  getProfilePath,
  missingCriticalFields,
  updateProfile
} from "../services/profile-store.js";

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
  server.registerTool("strava_data_inventory", {
    title: "Strava Data Inventory",
    description: "Inventory supported Strava data domains, auth scope requirements, privacy boundary and recommended first calls. Does not call Strava APIs or expose user data.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: DataInventoryOutputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }, async ({ response_format }) => {
    const inventory = buildDataInventory();
    return makeResponse(inventory, response_format, formatInventoryMarkdown(inventory));
  });
  server.registerTool(
    "strava_agent_manifest",
    {
      title: "Strava Agent Manifest",
      description: "Machine-readable install, runtime and client guidance for AI agents. Includes Hermes direct tool names and anti-gateway-restart guidance. Does not call Strava or expose secrets.",
      inputSchema: AgentManifestInputSchema.shape,
      outputSchema: AgentManifestOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ client: targetClient, response_format }) => {
      const manifest = buildAgentManifest(targetClient);
      return makeResponse(manifest, response_format, formatAgentManifestMarkdown(manifest));
    }
  );

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
    "strava_quickstart",
    {
      title: "Strava Quickstart",
      description:
        "Personalized 3-step setup walkthrough for the human user. Adapts to current state (env vars set? token present? what's next?). Call this first when the user asks 'how do I connect Strava?'",
      inputSchema: ResponseOnlyInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ response_format }) => {
      const status = await buildConnectionStatus();
      const hasEnv = status.missing_env.length === 0;
      const hasToken = status.ready_for_strava_api;
      const steps = [
        {
          step: 1,
          title: hasEnv ? "(done) Strava API credentials configured" : "Sign up at https://www.strava.com/settings/api",
          action: hasEnv
            ? "STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI are all set."
            : `Create a Strava API app, register a redirect URI (use ${status.redirect_uri ?? "http://127.0.0.1:3000/callback"}), then set: ${status.missing_env.join(", ")}.`,
          done: hasEnv,
        },
        {
          step: 2,
          title: hasToken ? "(done) Local token present — ready to read Strava data" : "Run the OAuth dance",
          action: hasToken
            ? "Tokens stored under ~/.strava-mcp/tokens.json. The connector will refresh automatically when needed."
            : "Run `strava-mcp-server auth` (or call strava_get_auth_url + strava_exchange_code from the agent). Open the URL, grant access, paste the code. Recommended scopes: read activity:read_all profile:read_all.",
          done: hasToken,
        },
        {
          step: 3,
          title: "Verify with the agent (and review GPS privacy)",
          action: "Call strava_connection_status, then strava_daily_summary or strava_training_context. GPS latlng and route geometry are withheld by default — set STRAVA_GPS_INCLUDE=true (or pass include_gps=true to strava_get_activity_streams) only when the user explicitly asks. Pair with wellness-nourish for fueling guidance.",
          example: hasToken
            ? "strava_training_context() → recent load + intensity handoff for nourish/cycle-coach."
            : "Until step 2 is done, the data tools will surface a clear 'auth required' message.",
          done: false,
        },
      ];
      const payload = {
        ok: true,
        ready: hasEnv && hasToken,
        steps,
        next: steps.find((s) => !s.done) ?? steps[steps.length - 1],
        gps_privacy_note: "Strava activities include GPS by default. This connector redacts latlng and route geometry unless STRAVA_GPS_INCLUDE=true or include_gps=true is explicitly passed.",
        cross_connector_hints: [
          "Pair Strava training load with wellness-nourish for fueling and recovery-aware meals.",
          "Pair Strava load with wellness-cycle-coach for late-luteal training adjustments.",
          "Pair Strava workouts + wellness-cgm-mcp glucose for endurance-fueling signals.",
        ],
      };
      const markdown = bulletList("Strava Quickstart", {
        ready: payload.ready,
        next: payload.next.title,
        gps_privacy_note: payload.gps_privacy_note,
      });
      return makeResponse(payload, response_format, markdown);
    }
  );

  server.registerTool(
    "strava_demo",
    {
      title: "Strava Demo",
      description:
        "Returns realistic example payloads of strava_daily_summary, strava_training_context, and strava_list_activities so agents see the contract before calling real Strava APIs.",
      inputSchema: ResponseOnlyInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ response_format }) => {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const payload = {
        ok: true,
        is_demo: true,
        sample: {
          strava_daily_summary: {
            date: today,
            activities: 1,
            total_distance_km: 5.0,
            total_duration_min: 28,
            sport_mix: { Run: 1 },
            intensity: { average_heart_rate: 142, max_heart_rate: 168, suffer_score: 32 },
            elevation_gain_m: 42,
          },
          strava_training_context: {
            window: "last_7d",
            sessions: 4,
            total_distance_km: 38.6,
            total_duration_min: 215,
            sport_mix: { Run: 3, Ride: 1 },
            average_intensity: "moderate",
            average_heart_rate: 138,
            load_band: "moderate",
            recommendation: "Steady aerobic block — one easy 5km, one tempo 8km, one long 12km, one recovery ride. Hold pace before adding intensity next week.",
          },
          strava_list_activities: {
            count: 4,
            records: [
              { id: 1100000001, name: "Morning easy run", sport_type: "Run", start_date: yesterday, distance_m: 5012, moving_time_s: 1680, average_heartrate: 142, suffer_score: 32 },
              { id: 1100000002, name: "Tempo intervals", sport_type: "Run", start_date: twoDaysAgo, distance_m: 8024, moving_time_s: 2640, average_heartrate: 165, suffer_score: 78 },
              { id: 1100000003, name: "Recovery spin", sport_type: "Ride", start_date: threeDaysAgo, distance_m: 18500, moving_time_s: 2700, average_heartrate: 118, suffer_score: 22 },
              { id: 1100000004, name: "Long run", sport_type: "Run", start_date: threeDaysAgo, distance_m: 12150, moving_time_s: 3960, average_heartrate: 138, suffer_score: 55 },
            ],
          },
        },
        notes: [
          "All sample data is synthetic; tagged with is_demo=true.",
          "Real calls return live data from the Strava v3 API after OAuth setup.",
          "GPS latlng and route geometry are omitted by default; the demo payload mirrors that defensive shape.",
        ],
      };
      const markdown = bulletList("Strava Demo", {
        is_demo: true,
        recent_sessions: 4,
        average_heart_rate: 138,
        recommendation: payload.sample.strava_training_context.recommendation,
      });
      return makeResponse(payload, response_format, markdown);
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
      description: "Check local Strava config, token file, Node version, privacy mode, cache readiness and optional MCP client readiness without calling Strava or exposing secrets.",
      inputSchema: ConnectionStatusInputSchema.shape,
      outputSchema: ConnectionStatusOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format, client: targetClient }) => {
      const status = await buildConnectionStatus({ client: targetClient });
      return makeResponse(status, response_format, bulletList("Strava Connection Status", {
        ok: status.ok,
        ready_for_strava_api: status.ready_for_strava_api,
        effective_status: status.effective_status,
        client: status.client,
        missing_env: status.missing_env.join(", ") || "none",
        scope_status: status.oauth.scope_status,
        granted_scopes: status.oauth.granted_scopes.join(" ") || "unknown",
        missing_recommended_scopes: status.oauth.missing_recommended_scopes.join(" ") || "none",
        activity_tools_ready: status.oauth.activity_tools_ready,
        token_path: status.token.path,
        token_exists: status.token.exists,
        privacy_mode: status.privacy_mode,
        client_recommendations: status.client_checks?.hermes?.recommendations.join(" | "),
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

  server.registerTool("strava_training_context", {
    title: "Strava Training Context",
    description: "Normalize recent Strava activity load into a compact training_context for workout recommendation engines. Includes fallback guidance when recent Strava activity is missing.",
    inputSchema: TrainingContextInputSchema.shape,
    outputSchema: TrainingContextOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const context = await buildTrainingContext(client(), params);
      return makeResponse(context, params.response_format, formatTrainingContextMarkdown(context));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  const ProfileGetInputSchema = ResponseOnlyInputSchema;
  const ProfileUpdateInputSchema = z.object({
    patch: z.record(z.string(), z.unknown()).describe("Partial WellnessProfileDocument patch. Top-level keys: profile, goals, devices, training, nutrition, preferences, safety, notes."),
    explicit_user_intent: z.boolean().optional().describe("Set to true ONLY after the user has explicitly confirmed they want to save this. Otherwise the tool refuses to write."),
    response_format: ResponseFormatSchema
  }).strict();
  const OnboardingInputSchema = z.object({
    locale: z.enum(["en", "pt-BR"]).optional().describe("Onboarding locale. Defaults to en."),
    response_format: ResponseFormatSchema
  }).strict();

  server.registerTool("strava_profile_get", {
    title: "Get Shared Wellness Profile",
    description:
      "Read the canonical Delx Wellness profile shared with the other wellness MCP connectors (Nourish, Cycle Coach, CGM, etc.). Read-only. Profile stores only what the user typed during onboarding — never OAuth tokens, API keys, or biomarkers. Note: this profile does NOT change Strava's GPS-redaction default; Strava continues to redact latlng and route geometry unless STRAVA_GPS_INCLUDE=true or include_gps=true is explicitly passed.",
    inputSchema: ProfileGetInputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    try {
      const profile = await getProfile();
      const payload = {
        ok: true,
        profile,
        summary: buildProfileSummary(profile),
        missing_critical: missingCriticalFields(profile),
        storage_path: getProfilePath()
      };
      return makeResponse(payload, response_format, bulletList("Wellness Profile", {
        summary: payload.summary,
        missing_critical: payload.missing_critical,
        storage_path: payload.storage_path
      }));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("strava_profile_update", {
    title: "Update Shared Wellness Profile",
    description:
      "Persist a partial patch to the canonical Delx Wellness profile. Requires explicit_user_intent=true after the user confirms they want to save. Rejects secret-like fields (oauth, token, api_key, password, cookie, refresh, session). Strava's GPS-redaction default is unaffected by profile changes.",
    inputSchema: ProfileUpdateInputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async ({ patch, explicit_user_intent, response_format }) => {
    if (explicit_user_intent !== true) {
      const payload = {
        ok: false,
        error: "USER_ACTION_REQUIRED",
        hint: "Set explicit_user_intent=true after the user confirms they want to save this."
      };
      return makeResponse(payload, response_format, bulletList("Wellness Profile Update", payload));
    }
    try {
      const profile = await updateProfile(patch as Record<string, unknown>);
      const payload = {
        ok: true,
        profile,
        summary: buildProfileSummary(profile),
        updated_fields: Object.keys(patch ?? {})
      };
      return makeResponse(payload, response_format, bulletList("Wellness Profile Updated", {
        summary: payload.summary,
        updated_fields: payload.updated_fields
      }));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("strava_onboarding", {
    title: "Wellness Onboarding Flow",
    description:
      "Read-only. Return the 11-question Delx Wellness onboarding flow (en or pt-BR), the current shared profile, missing critical fields, and a cross-connector hint. Use this when the user starts a fresh wellness session and you need to fill out preferred_name, goals, devices, training context, nutrition, preferences, and safety. Strava continues to redact GPS by default — onboarding does not change that.",
    inputSchema: OnboardingInputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ locale, response_format }) => {
    try {
      const flow = getOnboardingFlow(locale ?? "en");
      const profile = await getProfile();
      const payload = {
        ok: true,
        flow,
        profile,
        summary: buildProfileSummary(profile),
        missing_critical: missingCriticalFields(profile),
        storage_path: getProfilePath(),
        cross_connector_hint:
          "This profile is shared across the Delx Wellness MCPs (e.g. wellness-nourish, wellness-cycle-coach, wellness-cgm-mcp). One onboarding pass populates context for all of them. Strava already redacts GPS latlng and route geometry by default — this profile does not change that posture; set STRAVA_GPS_INCLUDE=true or include_gps=true only when the user explicitly asks."
      };
      const markdown = bulletList("Wellness Onboarding", {
        locale: flow.locale,
        questions: `${flow.questions.length} questions`,
        missing_critical: payload.missing_critical,
        storage_path: payload.storage_path,
        cross_connector_hint: payload.cross_connector_hint
      });
      return makeResponse(payload, response_format, markdown);
    } catch (error) {
      return makeError((error as Error).message);
    }
  });
}
