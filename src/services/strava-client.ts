import { URL, URLSearchParams } from "node:url";
import { DEFAULT_LIMIT, MAX_STRAVA_LIMIT, STRAVA_API_BASE_URL, STRAVA_AUTH_URL, STRAVA_DEAUTH_URL, STRAVA_TOKEN_URL } from "../constants.js";
import type { StravaConfig, StravaTokenSet } from "../types.js";
import { disabledCacheStatus, StravaCache, type CacheStatus } from "./cache.js";
import { redactErrorMessage } from "./redaction.js";
import { TokenStore } from "./token-store.js";

export interface ListParams {
  after?: string;
  before?: string;
  page?: number;
  limit?: number;
  all_pages?: boolean;
  max_pages?: number;
}

export class StravaClient {
  private readonly tokenStore: TokenStore;
  private cache?: StravaCache;

  constructor(private readonly config: StravaConfig) {
    this.tokenStore = new TokenStore(config.tokenPath);
  }

  authUrl(state?: string, scopes?: string[]): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: (scopes?.length ? scopes : this.config.scopes).join(",")
    });
    if (state) params.set("state", state);
    return `${STRAVA_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(input: string): Promise<{ ok: true; token_path: string; scope?: string; expires_at?: number }> {
    const code = this.extractCode(input);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });

    const tokens = await this.requestTokens(body);
    const redirectScope = this.extractScope(input);
    await this.tokenStore.withLock(async () => this.tokenStore.write({ ...tokens, scope: tokens.scope ?? redirectScope }));
    return { ok: true, token_path: this.config.tokenPath, scope: tokens.scope ?? redirectScope, expires_at: tokens.expires_at };
  }

  async get(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request("GET", path, undefined, params);
  }

  async post(path: string, body?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async revokeAccess(): Promise<{ ok: true; token_path: string; local_tokens_cleared: boolean }> {
    const token = await this.getValidToken();
    const body = new URLSearchParams({ access_token: token.access_token });
    const response = await this.fetchWithRetry(STRAVA_DEAUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "strava-mcp-server/0.1.0"
      },
      body: body.toString()
    });
    await this.parseResponse(response);
    await this.tokenStore.withLock(async () => this.tokenStore.clear());
    return { ok: true, token_path: this.config.tokenPath, local_tokens_cleared: true };
  }

  cacheStatus(): CacheStatus {
    if (!this.config.cacheEnabled) return disabledCacheStatus(this.config.cachePath);
    return this.getCache().status();
  }

  async list(path: string, params: ListParams = {}): Promise<{ records: unknown[]; next_page?: number; pages_fetched: number }> {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_STRAVA_LIMIT);
    const maxPages = params.all_pages ? Math.max(1, params.max_pages ?? 1) : 1;
    let page = Math.max(params.page ?? 1, 1);
    const records: unknown[] = [];
    let pages = 0;

    while (pages < maxPages) {
      const payload = await this.get(path, {
        after: toEpochSeconds(params.after),
        before: toEpochSeconds(params.before),
        page,
        per_page: limit
      });
      const pageRecords = Array.isArray(payload) ? payload : Array.isArray((payload as { records?: unknown[] }).records) ? (payload as { records: unknown[] }).records : [];
      records.push(...pageRecords);
      pages += 1;
      if (!params.all_pages || pageRecords.length < limit) break;
      page += 1;
    }

    return { records, next_page: records.length && records.length % limit === 0 ? page + (pages === 0 ? 0 : 0) : undefined, pages_fetched: pages };
  }

  private extractCode(input: string): string {
    try {
      const url = new URL(input);
      const code = url.searchParams.get("code");
      if (code) return code;
    } catch {
      // Not a URL; treat as raw code.
    }
    return input;
  }

  private extractScope(input: string): string | undefined {
    try {
      const url = new URL(input);
      return url.searchParams.get("scope") ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async request(method: "GET" | "POST", path: string, body?: Record<string, string | number | boolean | undefined>, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    const token = await this.getValidToken();
    const url = this.buildUrl(path, params);
    const response = await this.fetchWithRetry(url, {
      method,
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "strava-mcp-server/0.1.0"
      },
      body: body ? JSON.stringify(cleanParams(body)) : undefined
    });

    if (response.status === 401) {
      const refreshed = await this.refreshToken(true);
      const retry = await this.fetchWithRetry(url, {
        method,
        headers: {
          Authorization: `Bearer ${refreshed.access_token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "strava-mcp-server/0.1.0"
        },
        body: body ? JSON.stringify(cleanParams(body)) : undefined
      });
      return this.parseAndCache(method, url, retry);
    }

    return this.parseAndCache(method, url, response);
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${STRAVA_API_BASE_URL}${cleanPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async getValidToken(): Promise<StravaTokenSet> {
    const tokens = await this.tokenStore.read();
    if (!tokens?.access_token) {
      throw new Error("Strava token not found. Run strava_get_auth_url, authorize the app, then run strava_exchange_code.");
    }
    const expiresAt = tokens.expires_at ?? 0;
    const shouldRefresh = Boolean(tokens.refresh_token && expiresAt && expiresAt - Math.floor(Date.now() / 1000) < 3600);
    return shouldRefresh ? this.refreshToken(false) : tokens;
  }

  private async refreshToken(force: boolean): Promise<StravaTokenSet> {
    return this.tokenStore.withLock(async () => {
      const current = await this.tokenStore.read();
      if (!current?.refresh_token) {
        throw new Error("Strava refresh token not found. Re-authorize with strava_get_auth_url and strava_exchange_code.");
      }
      if (!force && current.expires_at && current.expires_at - Math.floor(Date.now() / 1000) >= 3600) {
        return current;
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: current.refresh_token,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });
      const refreshed = await this.requestTokens(body);
      await this.tokenStore.write({ ...current, ...refreshed });
      return { ...current, ...refreshed };
    });
  }

  private async requestTokens(body: URLSearchParams): Promise<StravaTokenSet> {
    const response = await this.fetchWithRetry(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "strava-mcp-server/0.1.0"
      },
      body: body.toString()
    });
    const data = await this.parseResponse(response) as Record<string, unknown>;
    const expiresAt = typeof data.expires_at === "number"
      ? data.expires_at
      : typeof data.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : undefined;
    return {
      access_token: String(data.access_token ?? ""),
      refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      token_type: typeof data.token_type === "string" ? data.token_type : undefined,
      scope: typeof data.scope === "string" ? data.scope : undefined,
      expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
      expires_at: expiresAt,
      athlete: data.athlete
    };
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const details = payload && typeof payload === "object" ? JSON.stringify(payload) : text;
      throw new Error(`Strava API HTTP ${response.status}: ${redactErrorMessage(details || response.statusText)}`);
    }
    return payload ?? {};
  }

  private async parseAndCache(method: "GET" | "POST", url: string, response: Response): Promise<unknown> {
    try {
      const payload = await this.parseResponse(response);
      if (this.config.cacheEnabled && method === "GET") {
        this.getCache().set(method, url, payload);
      }
      return payload;
    } catch (error) {
      if (this.config.cacheEnabled && method === "GET") {
        const cached = this.getCache().get(method, url);
        if (cached !== undefined) return cached;
      }
      throw error;
    }
  }

  private getCache(): StravaCache {
    this.cache ??= new StravaCache(this.config.cachePath);
    return this.cache;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === 2) return response;
      const delaySeconds = response.status === 429 ? 60 : 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
    throw new Error("Unreachable retry loop state");
  }
}

function toEpochSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function cleanParams(input: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")) as Record<string, string | number | boolean>;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
