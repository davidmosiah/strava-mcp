import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StravaClient } from '../dist/services/strava-client.js';

const dir = mkdtempSync(join(tmpdir(), 'strava-mcp-endpoint-contract-'));
const tokenPath = join(dir, 'tokens.json');
writeFileSync(tokenPath, JSON.stringify({ access_token: 'synthetic-token' }), { mode: 0o600 });

const config = {
  clientId: 'synthetic-client',
  clientSecret: 'synthetic-secret',
  redirectUri: 'http://127.0.0.1/callback',
  scopes: [],
  tokenPath,
  privacyMode: 'structured',
  cacheEnabled: false,
  cachePath: join(dir, 'cache.sqlite'),
};
const client = new StravaClient(config);

const originalFetch = globalThis.fetch;
const originalNoCache = process.env.STRAVA_NO_CACHE;
const requestedUrls = [];
process.env.STRAVA_NO_CACHE = 'true';

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requestedUrls.push(url);
  return Response.json([{ id: 123, name: 'Synthetic Ride' }]);
};

try {
  const result = await client.list('/athlete/activities', {
    after: '2026-07-08T23:00:00-03:00',
    before: '2026-07-15T23:00:00-03:00',
  });
  const requestUrl = requestedUrls.at(-1);
  assert.equal(requestUrl.searchParams.get('after'), '1783562400');
  assert.equal(requestUrl.searchParams.get('before'), '1784167200');
  assert.equal(result.records[0].id, 123);

  const fetchCountBeforeInvalid = requestedUrls.length;
  await assert.rejects(
    client.list('/athlete/activities', { after: 'not-a-date' }),
    /Invalid Strava after date-time/,
  );
  await assert.rejects(
    client.list('/athlete/activities', {
      after: '2026-07-15T23:00:00-03:00',
      before: '2026-07-08T23:00:00-03:00',
    }),
    /Strava after must not be later than before/,
  );
  assert.equal(requestedUrls.length, fetchCountBeforeInvalid, 'invalid ranges must fail before HTTP');

  // Full single page must advertise the *next* page, not the current one.
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    return Response.json(Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, name: `Ride ${i}` })));
  };
  const page1 = await client.list('/athlete/activities', { limit: 30, page: 1 });
  assert.equal(page1.records.length, 30);
  assert.equal(page1.next_page, 2, 'full page 1 must set next_page=2');
  assert.equal(page1.pages_fetched, 1);

  const page2 = await client.list('/athlete/activities', { limit: 30, page: 2 });
  assert.equal(page2.next_page, 3, 'full page 2 must set next_page=3');

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    const page = Number(url.searchParams.get('page') || '1');
    // Two full pages when all_pages walks forward.
    return Response.json(Array.from({ length: 30 }, (_, i) => ({ id: page * 100 + i, name: `P${page}-${i}` })));
  };
  const multi = await client.list('/athlete/activities', { limit: 30, all_pages: true, max_pages: 2 });
  assert.equal(multi.records.length, 60);
  assert.equal(multi.pages_fetched, 2);
  assert.equal(multi.next_page, 3, 'after two full pages next_page must be 3');

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    return Response.json([{ id: 1, name: 'Partial' }]);
  };
  const partial = await client.list('/athlete/activities', { limit: 30, page: 1 });
  assert.equal(partial.next_page, undefined, 'partial page must not set next_page');

  // Exercise the real authenticated request path; cache operations are a generic
  // method+URL Map double. No SQLite constructor, token refresh or network runs.
  const persistentCases = [
    { name: 'initial success', cacheEnabled: true, outcome: 'success' },
    { name: 'refreshed success', cacheEnabled: true, refresh: true, outcome: 'success' },
    { name: 'initial HTTP error', cacheEnabled: true, outcome: 'http' },
    { name: 'refreshed HTTP error', cacheEnabled: true, refresh: true, outcome: 'http' },
    { name: 'same credential HTTP error', cacheEnabled: true, sameCredential: true, outcome: 'http' },
    { name: 'disabled cache HTTP error', cacheEnabled: false, outcome: 'http' },
    { name: 'transport error', cacheEnabled: true, outcome: 'transport' },
    { name: 'response read error', cacheEnabled: true, outcome: 'read' },
  ];
  for (const scenario of persistentCases) {
    const scoped = new StravaClient({ ...config, cacheEnabled: scenario.cacheEnabled });
    const url = 'https://www.strava.com/api/v3/athlete';
    const key = `GET ${url}`;
    const stale = { marker: 'synthetic-existing-cache-entry' };
    const cached = new Map([[key, stale]]);
    const calls = { opens: 0, gets: 0, sets: 0, refreshes: 0, requests: [] };
    const storage = {
      get(method, requestUrl) { calls.gets++; return cached.get(`${method} ${requestUrl}`); },
      set(method, requestUrl, payload) { calls.sets++; cached.set(`${method} ${requestUrl}`, payload); },
      status() { return { enabled: true, path: 'synthetic-cache.sqlite', entries: cached.size }; },
    };
    scoped.getCache = () => { calls.opens++; return storage; };
    let credential = 'synthetic-A';
    scoped.getValidToken = async () => ({ access_token: credential });
    scoped.refreshToken = async () => { calls.refreshes++; return { access_token: 'synthetic-refreshed' }; };
    const error = new Error(`synthetic ${scenario.outcome} failure`);
    let phase = 'first';
    scoped.fetchWithRetry = async (requestUrl, init) => {
      calls.requests.push({ url: requestUrl, authorization: new Headers(init.headers).get('Authorization') });
      if (phase === 'first') return Response.json({ marker: 'synthetic-fresh-A' });
      if (scenario.refresh && calls.refreshes === 0) return new Response('', { status: 401 });
      if (scenario.outcome === 'transport') throw error;
      if (scenario.outcome === 'read') {
        const response = new Response('', { status: 200 });
        response.text = async () => { throw error; };
        return response;
      }
      if (scenario.outcome === 'http') return Response.json({ message: 'synthetic unavailable' }, { status: 503 });
      return Response.json({ marker: 'synthetic-fresh-B' });
    };
    assert.deepEqual(await scoped.get('/athlete'), { marker: 'synthetic-fresh-A' }, scenario.name);
    phase = 'second';
    if (!scenario.sameCredential) credential = 'synthetic-B';
    if (scenario.outcome === 'success') {
      assert.deepEqual(await scoped.get('/athlete'), { marker: 'synthetic-fresh-B' }, scenario.name);
    } else if (scenario.outcome === 'http') {
      await assert.rejects(() => scoped.get('/athlete'), /Strava API HTTP 503/, scenario.name);
    } else {
      await assert.rejects(() => scoped.get('/athlete'), observed => observed === error, scenario.name);
    }
    assert.equal(calls.opens, 0, `${scenario.name}: authenticated payloads must not open persistent cache`);
    assert.equal(calls.gets, 0, `${scenario.name}: authenticated errors must not read fallback`);
    assert.equal(calls.sets, 0, `${scenario.name}: authenticated successes must not persist payloads`);
    assert.deepEqual([...cached.entries()], [[key, stale]], `${scenario.name}: existing cache entries stay untouched`);
    assert.equal(scoped.cacheStatus().enabled, false, `${scenario.name}: cache status must not report a persistent cache that authenticated reads never use`);
    assert.equal(calls.opens, 0, `${scenario.name}: cache status must not open persistent cache`);
    assert.equal(calls.refreshes, scenario.refresh ? 1 : 0, scenario.name);
    assert.deepEqual(calls.requests.map(r => r.url), Array(scenario.refresh ? 3 : 2).fill(url), scenario.name);
    assert.deepEqual(calls.requests.map(r => r.authorization), [
      'Bearer synthetic-A',
      scenario.sameCredential ? 'Bearer synthetic-A' : 'Bearer synthetic-B',
      ...(scenario.refresh ? ['Bearer synthetic-refreshed'] : []),
    ], scenario.name);
  }
  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requestedUrls.length, persistent_cases: persistentCases.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.STRAVA_NO_CACHE;
  else process.env.STRAVA_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
