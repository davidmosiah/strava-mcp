/**
 * Deterministic synthetic activity fixtures in Strava streams format.
 *
 * Same 3-hour ride profile as garmin-mcp / Kindred Mi Fitness so both
 * downsamplers and the shared agent-safe-series/v1 contract can be regression-
 * tested against identical ground truth. See garmin-mcp#19.
 *
 * Profile:
 *   0–20 min    warm-up, 95 -> 130 bpm linear
 *   20–80 min   steady state, 140 bpm with a +/-8 bpm sinusoid (10 min period)
 *   80–110 min  3x (5 min threshold @ 168 / 5 min recovery @ 120)
 *   110–150 min tempo, 150 bpm with a +/-4 bpm sinusoid (5 min period)
 *   150–180 min cool-down, 145 -> 95 bpm linear
 */

export const RIDE_DURATION_SECONDS = 10800;
export const RIDE_ACTIVITY_ID = 9_900_000_001;
export const RIDE_START_DATE = '2026-07-15T06:00:00Z';

export function heartRateAt(t) {
  if (t < 1200) return 95 + (130 - 95) * (t / 1200);
  if (t < 4800) return 140 + 8 * Math.sin((2 * Math.PI * (t - 1200)) / 600);
  if (t < 6600) {
    const intoBlock = (t - 4800) % 600;
    return intoBlock < 300 ? 168 : 120;
  }
  if (t < 9000) return 150 + 4 * Math.sin((2 * Math.PI * (t - 6600)) / 300);
  return 145 - (145 - 95) * ((t - 9000) / 1800);
}

export function powerAt(t) {
  return Math.max(0, (heartRateAt(t) - 60) * 2.4);
}

/**
 * Build a Strava key_by_type streams payload.
 *
 * @param {object} [options]
 * @param {number} [options.durationSeconds]
 * @param {number} [options.sampleIntervalSeconds]
 * @param {Array<[number, number]>} [options.gaps] Inclusive [startSec, endSec] to drop.
 * @param {boolean} [options.includeTime]
 * @param {boolean} [options.includeGps]
 * @param {boolean} [options.asArray] Emit array-of-streams shape instead of key_by_type.
 */
export function buildSyntheticStreams(options = {}) {
  const {
    durationSeconds = RIDE_DURATION_SECONDS,
    sampleIntervalSeconds = 1,
    gaps = [],
    includeTime = true,
    includeGps = false,
    asArray = false
  } = options;

  const inGap = (t) => gaps.some(([start, end]) => t >= start && t <= end);
  const times = [];
  const heartrate = [];
  const watts = [];
  const latlng = [];

  for (let t = 0; t < durationSeconds; t += sampleIntervalSeconds) {
    if (inGap(t)) continue;
    times.push(t);
    heartrate.push(Math.round(heartRateAt(t) * 100) / 100);
    watts.push(Math.round(powerAt(t) * 100) / 100);
    if (includeGps) latlng.push([-3.73 + t * 1e-6, -38.52 + t * 1e-6]);
  }

  if (asArray) {
    const streams = [];
    if (includeTime) streams.push({ type: 'time', data: times, series_type: 'time', original_size: times.length });
    streams.push({ type: 'heartrate', data: heartrate, series_type: 'heartrate', original_size: heartrate.length });
    streams.push({ type: 'watts', data: watts, series_type: 'watts', original_size: watts.length });
    if (includeGps) streams.push({ type: 'latlng', data: latlng, series_type: 'latlng', original_size: latlng.length });
    return streams;
  }

  const payload = {
    heartrate: { data: heartrate, series_type: 'heartrate', original_size: heartrate.length, resolution: 'high' },
    watts: { data: watts, series_type: 'watts', original_size: watts.length, resolution: 'high' }
  };
  if (includeTime) {
    payload.time = { data: times, series_type: 'time', original_size: times.length, resolution: 'high' };
  }
  if (includeGps) {
    payload.latlng = { data: latlng, series_type: 'latlng', original_size: latlng.length, resolution: 'high' };
  }
  return payload;
}

/** Ground truth from the closed-form profile — independent of series.ts. */
export function groundTruth(options = {}) {
  const {
    durationSeconds = RIDE_DURATION_SECONDS,
    sampleIntervalSeconds = 1,
    gaps = []
  } = options;
  const inGap = (t) => gaps.some(([start, end]) => t >= start && t <= end);
  const values = [];
  for (let t = 0; t < durationSeconds; t += sampleIntervalSeconds) {
    if (inGap(t)) continue;
    values.push(heartRateAt(t));
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const percentile = (q) => {
    if (sorted.length === 0) return NaN;
    if (sorted.length === 1) return sorted[0];
    const rank = (sorted.length - 1) * q;
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
  };
  return {
    count: values.length,
    avg: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75)
  };
}

export function buildSyntheticActivitySummary(options = {}) {
  return {
    id: RIDE_ACTIVITY_ID,
    name: 'Synthetic 3h ride',
    type: 'Ride',
    start_date: RIDE_START_DATE,
    elapsed_time: options.elapsed_time ?? RIDE_DURATION_SECONDS,
    moving_time: options.moving_time ?? RIDE_DURATION_SECONDS,
    max_heartrate: options.max_heartrate ?? Math.round(groundTruth().max)
  };
}
