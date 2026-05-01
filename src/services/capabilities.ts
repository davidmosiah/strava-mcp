export function buildCapabilities() {
  return {
    project: "strava-mcp-unofficial",
    mcp_name: "io.github.davidmosiah/strava-mcp",
    creator: {
      name: "David Mosiah",
      github: "https://github.com/davidmosiah"
    },
    unofficial: true,
    api_boundary: {
      source: "Official Strava API v3 with OAuth 2.0",
      raw_definition: "Raw means the full JSON response returned by supported Strava API endpoints. For streams, it means Strava activity streams, not continuous 24/7 sensor telemetry.",
      does_not_include: [
        "continuous heart-rate samples outside recorded activities",
        "raw accelerometer/device telemetry",
        "private Strava endpoints",
        "activity creation/upload by default",
        "medical diagnosis or treatment guidance"
      ]
    },
    auth_model: {
      type: "OAuth 2.0 authorization code with refresh tokens",
      token_storage: "Local token file with user-only permissions",
      recommended_redirect_uri: "http://127.0.0.1:3000/callback",
      default_scopes: ["read", "activity:read_all", "profile:read_all"]
    },
    privacy_modes: [
      { mode: "summary", use_when: "Default-safe interpretation with GPS/map fields removed." },
      { mode: "structured", use_when: "Normalized activity, training and route metadata with raw GPS geometry limited." },
      { mode: "raw", use_when: "The user explicitly needs upstream Strava payloads or full stream data for debugging/deep analysis." }
    ],
    supported_data: [
      {
        name: "Athlete profile and zones",
        examples: ["authenticated athlete", "heart-rate zones", "power zones", "aggregate stats"],
        tools: ["strava_get_athlete", "strava_get_zones", "strava_get_athlete_stats"]
      },
      {
        name: "Activities and training load",
        examples: ["runs", "rides", "distance", "moving time", "elevation", "heart rate", "power", "relative effort"],
        tools: ["strava_list_activities", "strava_get_activity", "strava_daily_summary", "strava_weekly_summary"]
      },
      {
        name: "Activity streams",
        examples: ["time", "distance", "heartrate", "cadence", "watts", "altitude", "latlng when explicitly allowed"],
        tools: ["strava_get_activity_streams", "strava_get_activity_zones"]
      },
      {
        name: "Routes, clubs and gear",
        examples: ["saved routes", "route distance/elevation", "clubs", "bikes/shoes"],
        tools: ["strava_list_routes", "strava_get_route", "strava_list_clubs", "strava_get_gear"]
      }
    ],
    recommended_agent_flow: [
      "Call strava_agent_manifest when installing or operating inside a server agent such as Hermes.",
      "Call strava_connection_status before calling Strava data tools.",
      "If setup is incomplete, guide the user through setup, auth, and doctor.",
      "Use strava_daily_summary or strava_weekly_summary before low-level activity tools.",
      "For Hermes, use direct tools such as mcp_strava_strava_connection_status and reload config with /reload-mcp instead of restarting the gateway.",
      "Treat GPS as sensitive; avoid raw route/latlng payloads unless explicitly requested.",
      "Use Strava for training/load context; pair with WHOOP/Garmin/Oura for recovery and sleep physiology.",
      "Avoid medical diagnosis; frame outputs as training, route, recovery-context and performance planning."
    ],
    client_aliases: {
      hermes: {
        tool_prefix: "mcp_strava_",
        direct_tools: [
          "mcp_strava_strava_agent_manifest",
          "mcp_strava_strava_connection_status",
          "mcp_strava_strava_daily_summary",
          "mcp_strava_strava_weekly_summary",
          "mcp_strava_strava_get_activity_streams"
        ],
        reload_command: "/reload-mcp",
        gateway_restart_required_for_data_access: false
      }
    },
    contribution_paths: [
      "Improve setup UX for non-technical athletes.",
      "Add more MCP client examples.",
      "Add richer stream analytics and route privacy controls.",
      "Add evaluation fixtures for realistic training questions.",
      "Consider optional write/upload tools only behind explicit opt-in and safety gates."
    ],
    links: {
      github: "https://github.com/davidmosiah/strava-mcp",
      docs: "https://stravamcp.vercel.app/",
      npm: "https://www.npmjs.com/package/strava-mcp-unofficial",
      strava_api_docs: "https://developers.strava.com/docs/reference/",
      strava_auth_docs: "https://developers.strava.com/docs/authentication/",
      strava_rate_limits: "https://developers.strava.com/docs/rate-limits/"
    }
  };
}
