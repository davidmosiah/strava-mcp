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

  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requestedUrls.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.STRAVA_NO_CACHE;
  else process.env.STRAVA_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
