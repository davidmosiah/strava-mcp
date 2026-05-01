export const SERVER_NAME = "strava-mcp-server";
export const SERVER_VERSION = "0.1.0";

export const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
export const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_DEAUTH_URL = "https://www.strava.com/oauth/deauthorize";

export const DEFAULT_SCOPES = [
  "read",
  "activity:read_all",
  "profile:read_all"
];

export const DEFAULT_LIMIT = 30;
export const MAX_STRAVA_LIMIT = 200;
export const DEFAULT_MAX_PAGES = 1;
export const MAX_PAGES = 10;
