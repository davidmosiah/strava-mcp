import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StravaClient } from '../dist/services/strava-client.js';

const dir = mkdtempSync(join(tmpdir(), 'strava-mcp-endpoint-contract-'));
const tokenPath = join(dir, 'tokens.json');
writeFileSync(tokenPath, JSON.stringify({ access_token: 'synthetic-token' }), { mode: 0o600 });

const client = new StravaClient({
  clientId: 'synthetic-client',
  clientSecret: 'synthetic-secret',
  redirectUri: 'http://127.0.0.1/callback',
  scopes: [],
  tokenPath,
  privacyMode: 'structured',
  cacheEnabled: false,
  cachePath: join(dir, 'cache.sqlite'),
});

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

  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requestedUrls.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.STRAVA_NO_CACHE;
  else process.env.STRAVA_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
