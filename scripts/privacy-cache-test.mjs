import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPrivacyAudit } from '../dist/services/audit.js';
import { StravaCache } from '../dist/services/cache.js';
import { applyPrivacy, normalizeStreams } from '../dist/services/privacy.js';
import { redactErrorMessage, redactSensitive } from '../dist/services/redaction.js';

const activity = {
  id: 123,
  name: 'Morning Ride',
  sport_type: 'Ride',
  distance: 42000,
  moving_time: 5400,
  start_latlng: [40.1, -73.1],
  map: { summary_polyline: 'encoded' },
  average_heartrate: 142,
  weighted_average_watts: 210
};

const structured = applyPrivacy('/activities/123', activity, 'structured');
assert.equal(structured.id, 123);
assert.equal(structured.average_heartrate, 142);
assert.equal(structured.start_latlng, undefined);
assert.equal(structured.map, undefined);

const summary = applyPrivacy('/activities/123', activity, 'summary');
assert.equal(summary.distance, 42000);
assert.equal(summary.weighted_average_watts, 210);
assert.equal(summary.map, undefined);

const raw = applyPrivacy('/activities/123', activity, 'raw');
assert.equal(raw.map.summary_polyline, 'encoded');

const streams = normalizeStreams({ heartrate: { data: [120, 121] }, latlng: { data: [[1, 2]] } }, 'structured', false);
assert.equal(streams.latlng, undefined);
assert.deepEqual(streams.heartrate.data, [120, 121]);

assert.equal(redactSensitive({ access_token: 'abc', nested: { client_secret: 'def' } }).access_token, '[REDACTED]');
assert.match(redactErrorMessage('Authorization: Bearer abc.def.ghi'), /REDACTED/);
assert.equal(buildPrivacyAudit().unofficial, true);
assert.equal(buildPrivacyAudit().gps_redaction_default, true);

const dir = mkdtempSync(join(tmpdir(), 'strava-mcp-cache-'));
try {
  const path = join(dir, 'cache.sqlite');
  const cache = new StravaCache(path);
  cache.set('GET', 'https://example.com/a', { ok: true });
  assert.deepEqual(cache.get('GET', 'https://example.com/a'), { ok: true });
  assert.equal(cache.status().entries, 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, privacy: true, cache: true, redaction: true, audit: true }, null, 2));
