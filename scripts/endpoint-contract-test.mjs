import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runToolCall } from '../dist/cli/tool-calls.js';
import { registerStravaPrompts } from '../dist/prompts/strava-prompts.js';
import { registerStravaResources } from '../dist/resources/strava-resources.js';
import { registerStravaTools } from '../dist/tools/strava-tools.js';
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

async function checkInt64Ids() {
  const env = {
    HOME: dir, USERPROFILE: dir,
    STRAVA_CLIENT_ID: config.clientId, STRAVA_CLIENT_SECRET: config.clientSecret,
    STRAVA_REDIRECT_URI: config.redirectUri, STRAVA_TOKEN_PATH: tokenPath,
    STRAVA_CACHE: 'true', STRAVA_CACHE_PATH: config.cachePath,
    STRAVA_NO_CACHE: 'false', STRAVA_PRIVACY_MODE: 'summary',
  };
  const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const safe = 9007199254740991;
  const exact = '9007199254740993';
  const neighbor = '9007199254740992';
  const max = '9223372036854775807';
  const label = `Synthetic string with escaped JSON: "id":${exact}`;
  const activity = `{"id":${neighbor},"id_str":"${exact}","name":${JSON.stringify(label)},
    "start_date":"${new Date().toISOString()}","sport_type":"Ride","distance":2500.75,
    "start_latlng":[1,2],"map":{"summary_polyline":"synthetic-geometry"},
    "segment_efforts":[{"\\u0069d":${max},"activity_id":${exact},"start_latlng":[1,2]}]}`;
  const activities = `[${activity},{"id":${neighbor}},{"id":${exact}},{"id":${safe},"id_str":"${safe}"},
    {"id":${max},"id_str":""},{"id":9e30},{"id_str":"${max}"}]`;
  let athlete = `{"id":123,"id_str":"${exact}","city":"Synthetic City"}`;
  const paths = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v3/, '');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-token');
    paths.push(path);
    if (path === '/athlete/activities') return new Response(activities);
    if (path === '/athlete') return new Response(athlete);
    if (path === `/athletes/${exact}/stats`) return Response.json({ biggest_ride_distance: 2500.75 });
    if (path === `/athletes/${max}/routes`) return new Response(`[{"id":${neighbor},"id_str":"${max}","map":{"polyline":"synthetic-geometry"}}]`);
    if (path === `/routes/${max}`) return new Response(`{"id":${max},"map":{"polyline":"synthetic-geometry"}}`);
    if (path === '/gear/g123') return Response.json({ id: 'g123' });
    if (path === `/activities/${exact}`) return new Response(activity);
    if (path === `/activities/${exact}/streams`) return Response.json({ time: { data: [0, 1] }, heartrate: { data: [120, 121] }, latlng: { data: [[1, 2]] } });
    if (path === `/activities/${safe}/zones`) return Response.json([]);
    assert.fail(`unexpected synthetic Strava request: ${path}`);
  };

  const mcp = new McpServer({ name: 'strava-int64-fixture', version: '1.0.0' });
  registerStravaTools(mcp);
  registerStravaResources(mcp);
  registerStravaPrompts(mcp);
  const consumer = new Client({ name: 'strava-int64-contract', version: '1.0.0' });
  const [consumerTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await mcp.connect(serverTransport);
    await consumer.connect(consumerTransport);
    const call = (name, args = {}) => consumer.callTool({ name: `strava_${name}`, arguments: args });
    const list = await call('list_activities', { response_format: 'markdown' });
    const records = list.structuredContent.records;
    assert.deepEqual(records.map(record => record.id), [exact, neighbor, exact, safe, max, undefined, max],
      'paired, adjacent, safe, max, unrecoverable, and string-only IDs');
    assert.equal(records[0].id_str, exact);
    assert.equal(records[0].name, label);
    assert.equal(records[0].distance, 2500.75);
    assert.equal(records[0].start_latlng, undefined);
    assert.ok(list.content[0].text.includes(`## ${exact}\n`));
    assert.ok(list.content[0].text.includes('## item-6\n'));

    const resource = await consumer.readResource({ uri: 'strava://latest/activity' });
    const latest = JSON.parse(resource.contents[0].text).records[0];
    assert.equal(latest.id_str, exact);
    assert.equal(latest.map, undefined);
    const summary = await call('daily_summary', { response_format: 'json' });
    assert.equal(summary.structuredContent.latest_activity.id_str, exact);
    assert.equal(summary.structuredContent.latest_activity.id, exact);

    const detail = await call('get_activity', { id: records[0].id, privacy_mode: 'structured', response_format: 'json' });
    assert.equal(detail.structuredContent.endpoint, `/activities/${exact}`);
    const detailData = JSON.parse(detail.content[0].text).data;
    assert.deepEqual(detailData.segment_efforts, [{ id: max, activity_id: exact }]);
    assert.equal(detailData.map, undefined);
    const raw = await call('get_activity', { id: exact, privacy_mode: 'raw', explicit_user_intent: true });
    assert.equal(raw.structuredContent.data.id, exact);
    assert.deepEqual(raw.structuredContent.data.start_latlng, [1, 2]);
    assert.equal(paths.filter(path => path === `/activities/${exact}`).length, 2, 'authenticated responses bypass the HTTP cache');

    const stats = await call('get_athlete_stats');
    assert.equal(stats.structuredContent.endpoint, `/athletes/${exact}/stats`);
    athlete = `{"id":${max}}`;
    const routes = await call('list_routes');
    assert.equal(routes.structuredContent.endpoint, `/athletes/${max}/routes`);
    assert.deepEqual(routes.structuredContent.records, [{ id: max, id_str: max }]);
    const route = await call('get_route', { id: max });
    assert.deepEqual(route.structuredContent.data, { id: max });
    assert.equal((await call('get_gear', { id: 'g123' })).structuredContent.data.id, 'g123');
    assert.equal((await call('get_activity_zones', { id: safe })).structuredContent.endpoint, `/activities/${safe}/zones`);

    const streams = await call('get_activity_streams', { id: exact, keys: ['time', 'latlng'] });
    assert.equal(streams.structuredContent.endpoint, `/activities/${exact}/streams`);
    assert.equal(streams.structuredContent.data.latlng, undefined);
    const series = await call('activity_series', { id: exact });
    assert.equal(series.structuredContent.activity_id, exact);
    const prompt = await consumer.getPrompt({ name: 'strava_activity_stream_investigator', arguments: { activity_id: exact } });
    assert.ok(prompt.messages[0].content.text.includes(`id="${exact}"`));

    athlete = '{"id":9e30}';
    assert.equal((await call('list_routes')).isError, true);
    assert.equal(paths.at(-1), '/athlete', 'an unusable athlete ID must not become a route');

    const fetchCount = paths.length;
    for (const name of ['get_activity', 'get_activity_streams', 'activity_series']) {
      assert.equal((await call(name, { id: Number(exact) })).isError, true, name);
    }
    const originalWrite = stdout.write;
    let cliOutput = '';
    stdout.write = chunk => { cliOutput += chunk; return true; };
    try {
      assert.equal(await runToolCall(['strava_get_route', '--json', `{"id":${exact},"response_format":"json"}`]), 1);
    } finally {
      stdout.write = originalWrite;
    }
    assert.match(cliOutput, /id_str/);
    assert.equal(paths.length, fetchCount, 'rounded inputs fail before any Strava request');
  } finally {
    await consumer.close();
    await mcp.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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
  await checkInt64Ids();
  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requestedUrls.length, persistent_cases: persistentCases.length, int64_ids: true }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.STRAVA_NO_CACHE;
  else process.env.STRAVA_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
