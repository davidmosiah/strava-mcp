import { DEFAULT_SCOPES, NPM_PACKAGE_NAME, PINNED_NPM_PACKAGE, SERVER_VERSION } from "../constants.js";

export const AGENT_CLIENTS = ["generic", "claude", "cursor", "windsurf", "hermes", "openclaw"] as const;
export type AgentClientName = typeof AGENT_CLIENTS[number];

export const STRAVA_TOOL_NAMES = [
  "strava_agent_manifest", "strava_cache_status", "strava_capabilities",
  "strava_connection_status", "strava_daily_summary", "strava_data_inventory",
  "strava_demo", "strava_exchange_code", "strava_get_activity",
  "strava_get_activity_streams", "strava_get_activity_zones", "strava_get_athlete",
  "strava_get_athlete_stats", "strava_get_auth_url", "strava_get_zones",
  "strava_list_activities", "strava_privacy_audit", "strava_quickstart",
  "strava_revoke_access", "strava_training_context", "strava_weekly_summary"
];

export const STRAVA_RESOURCE_URIS = [
  "strava://agent-manifest", "strava://athlete", "strava://capabilities",
  "strava://inventory", "strava://latest/activity", "strava://summary/daily",
  "strava://summary/weekly"
];

export const HERMES_DIRECT_TOOLS = [
  "mcp_strava_strava_agent_manifest", "mcp_strava_strava_capabilities", "mcp_strava_strava_connection_status",
  "mcp_strava_strava_daily_summary", "mcp_strava_strava_data_inventory", "mcp_strava_strava_get_activity",
  "mcp_strava_strava_get_activity_streams", "mcp_strava_strava_list_activities", "mcp_strava_strava_privacy_audit",
  "mcp_strava_strava_training_context", "mcp_strava_strava_weekly_summary"
];

export function parseAgentClientName(value: string): AgentClientName {
  if ((AGENT_CLIENTS as readonly string[]).includes(value)) return value as AgentClientName;
  throw new Error(`Unsupported client: ${value}. Use ${AGENT_CLIENTS.join(", ")}.`);
}

export function buildAgentManifest(client: AgentClientName = "generic") {
  return {
    project: NPM_PACKAGE_NAME,
    mcp_name: "io.github.davidmosiah/strava-mcp",
    client,
    unofficial: true,
    package: {
      name: NPM_PACKAGE_NAME,
      version: SERVER_VERSION,
      install_command: `npx -y ${NPM_PACKAGE_NAME}`,
      pinned_install_command: `npx -y ${PINNED_NPM_PACKAGE}`,
      binary: "strava-mcp-server"
    },
    oauth: {
      provider: "Strava OAuth 2.0",
      redirect_uri: "http://127.0.0.1:3000/callback",
      scopes: DEFAULT_SCOPES,
      token_storage: "~/.strava-mcp/tokens.json",
      secret_storage: "~/.strava-mcp/config.json"
    },
    recommended_first_calls: [
      "strava_quickstart",
      "strava_demo",
      "strava_agent_manifest",
      "strava_connection_status",
      "strava_data_inventory",
      "strava_training_context"
    ],
    standard_tools: STRAVA_TOOL_NAMES,
    resources: STRAVA_RESOURCE_URIS,
    hermes: {
      config_path: "~/.hermes/config.yaml",
      skill_path: "~/.hermes/skills/strava-mcp/SKILL.md",
      tool_name_prefix: "mcp_strava_",
      common_tool_names: HERMES_DIRECT_TOOLS,
      recommended_config: hermesConfigSnippet(),
      use_direct_tools: true,
      avoid_terminal_workarounds: true,
      no_gateway_restart_for_data_access: true,
      reload_after_config_change: "/reload-mcp",
      doctor_command: `npx -y ${PINNED_NPM_PACKAGE} doctor --client hermes`
    },
    agent_rules: [
      "Call strava_connection_status and strava_data_inventory before Strava data tools.",
      "If running inside Hermes, prefer direct MCP tools named mcp_strava_strava_* instead of shelling out through Python or terminal commands.",
      "After changing Hermes MCP config, use /reload-mcp; do not restart the Hermes gateway for normal Strava data access.",
      "Never print STRAVA_CLIENT_SECRET, access tokens or refresh tokens.",
      "Treat GPS, routes and raw streams as sensitive; request raw or latlng data only when the user explicitly asks.",
      "Use the official Strava API boundary only; this package is unofficial and does not scrape private endpoints.",
      "Use strava_training_context as the compact load handoff to Exercise Catalog; combine with WHOOP/Garmin/Oura for recovery physiology."
    ],
    troubleshooting: [
      {
        symptom: "Hermes lists the MCP server but the agent still uses terminal commands",
        action: "Install the Hermes skill and tell the agent to call mcp_strava_strava_connection_status first."
      },
      {
        symptom: "401 missing activity:read_permission",
        action: "Re-run auth and grant read activity:read_all profile:read_all."
      },
      {
        symptom: "Hermes config changed but tools did not update",
        action: "Run /reload-mcp or hermes mcp test strava; avoid hermes gateway restart unless Hermes itself is unhealthy."
      },
      {
        symptom: "npx uses an older cached package",
        action: `Pin the command to ${PINNED_NPM_PACKAGE} in the MCP config.`
      }
    ],
    links: {
      github: "https://github.com/davidmosiah/strava-mcp",
      docs: "https://stravamcp.vercel.app/",
      npm: "https://www.npmjs.com/package/strava-mcp-unofficial"
    }
  };
}

export function formatAgentManifestMarkdown(manifest: ReturnType<typeof buildAgentManifest>): string {
  const lines = [
    "# Strava MCP Agent Manifest",
    "",
    `- **project**: ${manifest.project}`,
    `- **client**: ${manifest.client}`,
    `- **unofficial**: ${manifest.unofficial}`,
    `- **package**: ${manifest.package.pinned_install_command}`,
    "",
    "## Start here",
    ...manifest.recommended_first_calls.map((tool) => `- ${tool}`),
    "",
    "## Hermes",
    `- **config**: ${manifest.hermes.config_path}`,
    `- **skill**: ${manifest.hermes.skill_path}`,
    `- **reload**: ${manifest.hermes.reload_after_config_change}`,
    `- **do not restart gateway for data access**: ${manifest.hermes.no_gateway_restart_for_data_access}`,
    "",
    "### Common Hermes tool names",
    ...manifest.hermes.common_tool_names.map((tool) => `- ${tool}`),
    "",
    "## Agent rules",
    ...manifest.agent_rules.map((rule) => `- ${rule}`)
  ];
  return lines.join("\n");
}

export function hermesConfigSnippet(): string {
  return [
    "mcp_servers:",
    "  strava:",
    "    command: npx",
    "    args:",
    "      - -y",
    `      - ${PINNED_NPM_PACKAGE}`,
    "    timeout: 120",
    "    connect_timeout: 60",
    "    sampling:",
    "      enabled: false",
    "",
    "approvals:",
    "  mcp_reload_confirm: false"
  ].join("\n");
}

export function hermesSkillMarkdown(): string {
  return [
    "# Strava MCP",
    "",
    "Use this skill whenever a user asks Hermes to inspect Strava training, routes, activity streams, daily summaries or weekly summaries through the Strava MCP.",
    "",
    "## Runtime Contract",
    "",
    "- Prefer direct MCP tools exposed by Hermes. Common names are:",
    ...HERMES_DIRECT_TOOLS.map((tool) => `  - \`${tool}\``),
    "- Start every Strava task with `mcp_strava_strava_connection_status` unless the user only asks for installation help.",
    "- Use `mcp_strava_strava_agent_manifest` when you need machine-readable install or client instructions.",
    "- Do not use terminal, Python, curl or npm as a workaround for normal Strava data access when MCP tools are available.",
    "- After editing `/root/.hermes/config.yaml` or `~/.hermes/config.yaml`, reload MCP with `/reload-mcp` or `hermes mcp test strava`.",
    "- Do not restart the Hermes gateway for normal Strava MCP config/data access. Restart only when Hermes itself is unhealthy.",
    "- Never print Strava client secrets, access tokens or refresh tokens.",
    "- Treat GPS, route geometry and raw streams as sensitive. Ask for explicit user consent before requesting raw GPS or `latlng` streams.",
    "",
    "## First Calls",
    "",
    "1. `mcp_strava_strava_connection_status`",
    "2. `mcp_strava_strava_daily_summary` for today's context",
    "3. `mcp_strava_strava_weekly_summary` for load trends",
    "4. `mcp_strava_strava_get_activity_streams` only for a specific activity investigation"
  ].join("\n");
}
