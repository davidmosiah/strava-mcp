/**
 * Contract gate for `strava_demo`.
 *
 * The demo tool exists so agents can see the payload shape before calling the
 * real Strava API. A hand-written example nobody compares against reality
 * drifts silently, and an agent that trusts it writes a parser for fields that
 * never arrive.
 *
 * This gate runs the REAL builders over the repo fixture and compares key sets
 * against the demo payload, failing in both directions:
 *
 *   - a key in the demo that the builders never emit  -> invented contract
 *   - a key the builders emit that the demo omits     -> incomplete contract
 *
 * Arrays are compared as the union of their elements' key paths, because a real
 * page of activities mixes rides (power, kilojoules, no workout_type) and runs
 * (workout_type, no power) and either alone under-describes the shape.
 *
 * Comparison happens on the JSON round-trip, because that is what the agent
 * receives: a key whose value is `undefined` never crosses the wire and must
 * not be advertised as if it did.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDailySummary } from '../dist/services/summary.js';
import { buildTrainingContext } from '../dist/services/context.js';
import { buildCollectionOutput } from '../dist/services/collection.js';
import { buildDemoPayload } from '../dist/services/demo.js';
import { syntheticClient } from '../fixtures/strava-activities.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, '..', 'fixtures', 'strava-activities.mjs');
const TIMEZONE = 'America/Fortaleza';
const WINDOW_DAYS = 7;
const ACTIVITIES_ENDPOINT = '/athlete/activities';
// The connector's default when STRAVA_PRIVACY_MODE is unset (see config.ts).
// The demo must show what an agent gets without passing privacy_mode at all.
const DEFAULT_PRIVACY_MODE = 'structured';

/**
 * Keys the builders only emit for input the fixture does not contain (an athlete
 * with no recent activities, a summary-mode call, ...). The demo may still show
 * them because they are part of the contract an agent can encounter. Each entry
 * needs a reason.
 *
 * This is deliberately narrow. Adding a key here to silence the gate defeats the
 * gate — only list fields that are genuinely conditional.
 */
const OPTIONAL_IN_REAL = new Map([
  // No allowances needed today: the fixture exercises every documented field.
  // Kept as the explicit, reviewable place to record one if that ever changes.
]);

function keyPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    // Union across elements: a page of activities mixes rides and runs.
    for (const item of value) keyPaths(item, `${prefix}[]`, out);
    return out;
  }
  if (value === null || typeof value !== 'object') return out;
  for (const key of Object.keys(value)) {
    const p = prefix ? `${prefix}.${key}` : key;
    out.add(p);
    keyPaths(value[key], p, out);
  }
  return out;
}

/** What the agent actually receives: undefined-valued keys do not survive. */
function overTheWire(value) {
  return JSON.parse(JSON.stringify(value));
}

function diff(demoSet, realSet) {
  const invented = [...demoSet].filter((k) => !realSet.has(k)).sort();
  const missing = [...realSet]
    .filter((k) => !demoSet.has(k) && !OPTIONAL_IN_REAL.has(k))
    .sort();
  return { invented, missing };
}

function report(name, invented, missing) {
  const lines = [];
  if (invented.length > 0) {
    lines.push(
      `\n  ${name}: ${invented.length} key(s) in the demo that the real builder NEVER returns.`,
      `  An agent trusting these writes a parser for data that never arrives:`,
      ...invented.map((k) => `    - ${k}`)
    );
  }
  if (missing.length > 0) {
    lines.push(
      `\n  ${name}: ${missing.length} key(s) the real builder returns but the demo omits.`,
      `  Agents reading the demo will not know these exist:`,
      ...missing.map((k) => `    + ${k}`)
    );
  }
  return lines.join('\n');
}

const client = syntheticClient();
const summaryOptions = { days: WINDOW_DAYS, timezone: TIMEZONE };

const real = {
  strava_daily_summary: await buildDailySummary(client, summaryOptions),
  strava_training_context: await buildTrainingContext(client, summaryOptions),
  strava_list_activities: buildCollectionOutput(
    ACTIVITIES_ENDPOINT,
    await client.list(),
    DEFAULT_PRIVACY_MODE
  )
};

const demo = buildDemoPayload().sample;

const failures = [];
let checked = 0;

for (const [name, realPayload] of Object.entries(real)) {
  assert.ok(demo[name], `demo payload is missing the ${name} sample entirely`);
  const demoSet = keyPaths(overTheWire(demo[name]));
  const realSet = keyPaths(overTheWire(realPayload));
  const { invented, missing } = diff(demoSet, realSet);
  checked += demoSet.size;
  if (invented.length > 0 || missing.length > 0) {
    failures.push(report(name, invented, missing));
  } else {
    console.log(`PASS ${name} — ${demoSet.size} key paths match the real builder`);
  }
}

// The demo must stay honest about being synthetic, whatever the shape says.
const payload = buildDemoPayload();
assert.equal(payload.is_demo, true, 'demo payload must be tagged is_demo=true');
assert.equal(payload.ok, true, 'demo payload must be tagged ok=true');
assert.ok(Array.isArray(payload.notes) && payload.notes.length > 0, 'demo payload must carry notes');
console.log('PASS demo payload is tagged synthetic');

// The fixture feeds GPS-bearing fields in on purpose; neither the real output nor
// the demo may carry them, or the demo would re-teach agents the wrong contract.
const GPS_KEYS = [
  'start_latlng',
  'end_latlng',
  'latlng',
  'map',
  'polyline',
  'summary_polyline',
  'coordinates',
  'location_city',
  'location_state',
  'location_country'
];
function assertNoGpsKeys(name, value) {
  for (const key of keyPaths(overTheWire(value))) {
    const leaf = key.split('.').pop().replace('[]', '');
    assert.ok(!GPS_KEYS.includes(leaf), `${name} leaked GPS-bearing key "${key}" — privacy regression`);
  }
}
for (const [name, realPayload] of Object.entries(real)) {
  assertNoGpsKeys(`real ${name}`, realPayload);
}
// Checked by key, not by substring: the notes legitimately say the word "latlng"
// while explaining that the field is withheld.
assertNoGpsKeys('demo payload', payload);
console.log('PASS demo payload and real output carry no GPS-bearing keys');

if (failures.length > 0) {
  console.error('\nFAIL demo contract drifted from the real builders:');
  console.error(failures.join('\n'));
  console.error(
    `\nFix src/services/demo.ts so the examples match what the builders return.` +
      `\nFixture: ${FIXTURE}` +
      '\nDo not widen OPTIONAL_IN_REAL to silence this — that is how the drift got here.\n'
  );
  process.exit(1);
}

console.log(`\ndemo-contract: ${checked} key paths verified against the real builders`);
console.log(JSON.stringify({ ok: true, suite: 'demo-contract', samples: Object.keys(real).length }));
