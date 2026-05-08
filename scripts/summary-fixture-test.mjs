import assert from 'node:assert/strict';
import { buildDailySummary, buildWeeklySummary } from '../dist/services/summary.js';
import { buildTrainingContext, formatTrainingContextMarkdown } from '../dist/services/context.js';

const hour = 60 * 60 * 1000;
const now = Date.now();
const isoDaysAgo = (days) => new Date(now - days * 24 * hour).toISOString();

const activities = [
  { id: 1, name: 'Tempo Run', sport_type: 'Run', start_date: isoDaysAgo(1), distance: 10000, moving_time: 3000, total_elevation_gain: 80, average_heartrate: 158, suffer_score: 85 },
  { id: 2, name: 'Endurance Ride', sport_type: 'Ride', start_date: isoDaysAgo(2), distance: 52000, moving_time: 7200, total_elevation_gain: 430, weighted_average_watts: 185, suffer_score: 120 },
  { id: 3, name: 'Easy Run', sport_type: 'Run', start_date: isoDaysAgo(4), distance: 6000, moving_time: 2100, total_elevation_gain: 35, average_heartrate: 135, suffer_score: 35 },
  { id: 4, name: 'Previous Ride', sport_type: 'Ride', start_date: isoDaysAgo(10), distance: 30000, moving_time: 4200, total_elevation_gain: 220, suffer_score: 60 }
];

const fakeClient = {
  async list(endpoint) {
    assert.equal(endpoint, '/athlete/activities');
    return { records: activities, pages_fetched: 1 };
  }
};

const daily = await buildDailySummary(fakeClient, { days: 7, timezone: 'UTC' });
assert.equal(daily.kind, 'daily_summary');
assert.equal(daily.latest_activity.sport_type, 'Run');
assert.equal(daily.training_load.stats.activity_count, 3);
assert.equal(daily.training_load.stats.distance_km, 68);
assert.ok(daily.diagnostic.action_candidates.length >= 3);

const weekly = await buildWeeklySummary(fakeClient, { days: 7, compare_days: 7, timezone: 'UTC' });
assert.equal(weekly.kind, 'weekly_summary');
assert.equal(weekly.scorecard.current.activity_count, 3);
assert.equal(weekly.scorecard.previous.activity_count, 1);
assert.ok(weekly.diagnostic.bottlenecks.length >= 1);

const context = await buildTrainingContext(fakeClient, { days: 7, timezone: 'UTC' });
assert.equal(context.source, 'strava');
assert.equal(context.context_contract_version, 'delx-wellness-context/v1');
assert.equal(context.context_type, 'training_context');
assert.equal(context.privacy.gps, 'withheld_from_context');
assert.equal(context.recommended_handoff.tool, 'exercise_catalog_recommend_session');
assert.equal(context.recent_training_load, 'normal');
assert.equal(context.last_activity_type, 'Run');
assert.equal(context.weekly_minutes, 205);
assert.equal(context.relative_effort, 240);
assert.ok(context.telegram_summary.includes('Strava'));
const contextMarkdown = formatTrainingContextMarkdown(context);
assert.ok(contextMarkdown.includes('context_type'));
assert.ok(contextMarkdown.includes('withheld_from_context'));
assert.ok(contextMarkdown.includes('exercise_catalog_recommend_session'));

console.log(JSON.stringify({ ok: true, daily: daily.kind, weekly: weekly.kind }, null, 2));
