/**
 * Regression tests for agent-safe-series/v1 on Strava streams (parity with
 * garmin-mcp and Kindred Mi Fitness Data Bridge — garmin-mcp#19).
 *
 * Expectations come from groundTruth() in the fixture, never from series.ts.
 */
import assert from 'node:assert/strict';
import {
  SERIES_HARD_MAX_POINTS,
  buildActivitySeries,
  computeStats,
  downsampleToBuckets,
  extractSamples,
  percentile
} from '../dist/services/series.js';
import {
  RIDE_ACTIVITY_ID,
  RIDE_START_DATE,
  buildSyntheticStreams,
  groundTruth
} from './synthetic-series-fixture.mjs';

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${label}`);
}

const ride = buildSyntheticStreams();
const truth = groundTruth();

check('fixture is a 3h ride at 1 Hz', () => {
  assert.equal(ride.heartrate.data.length, 10800);
  assert.equal(truth.count, 10800);
});

check('extractSamples reads Strava key_by_type streams', () => {
  const { samples, hasClock } = extractSamples(ride, 'heart_rate');
  assert.equal(samples.length, 10800);
  assert.equal(hasClock, true);
  assert.equal(samples[0].t, 0);
  assert.equal(samples[10799].t, 10799);
});

check('extractSamples also accepts array-of-streams shape', () => {
  const asArray = buildSyntheticStreams({ durationSeconds: 60, asArray: true });
  const { samples } = extractSamples(asArray, 'heart_rate');
  assert.equal(samples.length, 60);
});

check('stats are computed on full-resolution samples, not on buckets', () => {
  const series = buildActivitySeries(ride, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  assert.ok(series.downsampled);
  assert.ok(Math.abs(series.stats.min - Math.round(truth.min * 100) / 100) < 0.5);
  assert.ok(Math.abs(series.stats.max - Math.round(truth.max * 100) / 100) < 0.5);
  assert.ok(Math.abs(series.stats.avg - truth.avg) < 0.5, `avg ${series.stats.avg} vs ${truth.avg}`);
});

check('metadata declares the loss honestly', () => {
  const series = buildActivitySeries(ride, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  assert.equal(series.method, 'time_bucket_mean');
  assert.equal(series.contract_version, 'agent-safe-series/v1');
  assert.equal(series.unit, 'bpm');
  assert.equal(series.t_unit, 'seconds_from_start');
  assert.ok(series.returned_points < series.source_points);
  assert.equal(series.source_points, 10800);
});

check('hard cap holds even when the caller asks for more', () => {
  const series = buildActivitySeries(ride, {
    activityId: RIDE_ACTIVITY_ID,
    metric: 'heart_rate',
    resolutionSeconds: 1,
    maxPoints: 100000
  });
  assert.ok(series.returned_points <= SERIES_HARD_MAX_POINTS);
  assert.ok(series.resolution_seconds > series.requested_resolution_seconds);
  assert.ok(series.notes.some((note) => note.includes('max_points')));
});

check('every source sample is accounted for in exactly one bucket', () => {
  const series = buildActivitySeries(ride, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  const bucketed = series.points.reduce((acc, point) => acc + point.samples, 0);
  assert.equal(bucketed, series.source_points);
});

check('short activity returns full precision', () => {
  const short = buildSyntheticStreams({ durationSeconds: 120 });
  const series = buildActivitySeries(short, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  assert.equal(series.downsampled, false);
  assert.equal(series.method, 'none');
  assert.equal(series.returned_points, series.source_points);
});

check('time_in_zone declares observed_max by default', () => {
  const series = buildActivitySeries(ride, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  assert.equal(series.time_in_zone.reference_source, 'observed_max');
  assert.ok(series.notes.some((note) => note.includes('reference_max_hr')));
});

check('caller-supplied max HR is labelled caller_provided', () => {
  const series = buildActivitySeries(ride, {
    activityId: RIDE_ACTIVITY_ID,
    metric: 'heart_rate',
    referenceMaxHr: 190
  });
  assert.equal(series.time_in_zone.reference_source, 'caller_provided');
  assert.equal(series.time_in_zone.reference_max_hr, 190);
});

check('activity-row max HR is labelled activity_recorded_max', () => {
  const series = buildActivitySeries(ride, {
    activityId: RIDE_ACTIVITY_ID,
    metric: 'heart_rate',
    activityRecordedMaxHr: 185
  });
  assert.equal(series.time_in_zone.reference_source, 'activity_recorded_max');
  assert.equal(series.time_in_zone.reference_max_hr, 185);
});

check('without nominal duration, head gap reads as shorter activity', () => {
  const headless = buildSyntheticStreams({ gaps: [[0, 4000]] });
  const series = buildActivitySeries(headless, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  assert.equal(series.data_quality.coverage_anchor, 'sample_span');
  assert.equal(series.data_quality.coverage_ratio, 1);
});

check('duration-anchored coverage surfaces a head gap (Kindred pattern)', () => {
  const headless = buildSyntheticStreams({ gaps: [[0, 1200]] });
  const series = buildActivitySeries(headless, {
    activityId: RIDE_ACTIVITY_ID,
    metric: 'heart_rate',
    nominalDurationSeconds: 10800,
    startTime: RIDE_START_DATE
  });
  assert.equal(series.data_quality.coverage_anchor, 'nominal_duration');
  assert.equal(series.start_time, RIDE_START_DATE);
  assert.ok(
    series.data_quality.coverage_ratio > 0.85 && series.data_quality.coverage_ratio < 0.92,
    `coverage ${series.data_quality.coverage_ratio}`
  );
  assert.ok(series.data_quality.longest_gap_seconds >= 1200);
});

check('GPS latlng never appears in the series payload', () => {
  const withGps = buildSyntheticStreams({ includeGps: true });
  const series = buildActivitySeries(withGps, { activityId: RIDE_ACTIVITY_ID, metric: 'heart_rate' });
  const encoded = JSON.stringify(series);
  assert.ok(!encoded.includes('-3.73'));
  assert.ok(!encoded.includes('-38.52'));
  assert.ok(series.notes.some((note) => note.includes('GPS') || note.includes('latlng')));
});

check('power metric extracts independently', () => {
  const series = buildActivitySeries(ride, { activityId: RIDE_ACTIVITY_ID, metric: 'power' });
  assert.equal(series.unit, 'watts');
  assert.equal(series.source_points, 10800);
  assert.equal(series.time_in_zone, undefined);
});

check('missing metric errors instead of empty series', () => {
  const hrOnly = { time: ride.time, heartrate: ride.heartrate };
  assert.throws(
    () => buildActivitySeries(hrOnly, { activityId: RIDE_ACTIVITY_ID, metric: 'elevation' }),
    /No elevation samples/
  );
});

check('percentile interpolates linearly', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([10], 0.9), 10);
});

check('bucket boundaries are stable', () => {
  const samples = [
    { t: 0, value: 10 },
    { t: 30, value: 20 },
    { t: 59, value: 30 },
    { t: 60, value: 40 },
    { t: 119, value: 50 }
  ];
  const points = downsampleToBuckets(samples, 60);
  assert.equal(points.length, 2);
  assert.equal(points[0].samples, 3);
  assert.equal(points[1].samples, 2);
});

check('computeStats on a known vector', () => {
  const stats = computeStats([100, 110, 120, 130, 140]);
  assert.equal(stats.avg, 120);
  assert.equal(stats.percentile_method, 'linear_interpolation');
});

console.log(`\nactivity-series: ${passed} checks passed`);
