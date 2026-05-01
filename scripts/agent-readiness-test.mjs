import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConnectionStatus } from '../dist/services/connection-status.js';
import { formatCollection } from '../dist/services/format.js';

const dir = mkdtempSync(join(tmpdir(), 'strava-mcp-agent-readiness-'));

try {
  const markdown = formatCollection('Strava Activities', [
    { id: 1, name: 'Morning Tennis', sport_type: 'Tennis', start_date: '2026-04-27T12:30:43Z', distance: 41.3 },
    { id: 2, name: 'Afternoon Tennis', sport_type: 'Tennis', start_date: '2026-04-26T20:05:51Z', distance: 4557 }
  ], {
    endpoint: '/athlete/activities',
    privacy_mode: 'summary',
    count: 2,
    records: [{ id: 1 }, { id: 2 }],
    pages_fetched: 1
  });

  assert.doesNotMatch(markdown, /\[object Object\]/, 'Markdown previews must never leak JavaScript object stringification.');
  assert.doesNotMatch(markdown, /\*\*records\*\*/i, 'Collection markdown should not duplicate full record arrays in metadata.');
  assert.match(markdown, /Morning Tennis/);

  const tokenPath = join(dir, 'tokens.json');
  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: 'read'
  }), { mode: 0o600 });

  const limited = await buildConnectionStatus({
    env: {
      STRAVA_CLIENT_ID: 'client-id',
      STRAVA_CLIENT_SECRET: 'client-secret',
      STRAVA_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      STRAVA_TOKEN_PATH: tokenPath
    },
    homeDir: dir,
    nowMs: 1_000_000
  });

  assert.equal(limited.ready_for_strava_api, false, 'A read-only token should not be reported as fully ready for Strava activity tools.');
  assert.equal(limited.ok, false);
  assert.deepEqual(limited.oauth.granted_scopes, ['read']);
  assert.ok(limited.oauth.missing_recommended_scopes.includes('activity:read_all'));
  assert.ok(limited.oauth.missing_recommended_scopes.includes('profile:read_all'));
  assert.equal(limited.oauth.activity_tools_ready, false);
  assert.ok(limited.next_steps.some((step) => /re-authorize/i.test(step) && /activity:read_all/.test(step)));

  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: 'activity:read_all profile:read_all read'
  }), { mode: 0o600 });

  const ready = await buildConnectionStatus({
    env: {
      STRAVA_CLIENT_ID: 'client-id',
      STRAVA_CLIENT_SECRET: 'client-secret',
      STRAVA_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      STRAVA_TOKEN_PATH: tokenPath
    },
    homeDir: dir,
    nowMs: 1_000_000
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.ready_for_strava_api, true);
  assert.deepEqual(ready.oauth.missing_recommended_scopes, []);
  assert.equal(ready.oauth.activity_tools_ready, true);

  console.log(JSON.stringify({ ok: true, markdown: true, scope_diagnostics: true }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
