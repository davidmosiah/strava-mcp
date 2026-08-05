/**
 * Agent-safe time-series shaping for Strava activity streams.
 *
 * A 3-hour ride at 1 Hz is ~10,800 samples. Handing that to an agent burns the
 * context window and buys nothing: the agent needs the shape of the effort and
 * exact aggregates, not every sample. This module turns Strava stream payloads
 * into a bounded response that says exactly what it did.
 *
 * Contract: `agent-safe-series/v1` — shared with Garmin MCP and Mi Fitness Data
 * Bridge (Kindred). See https://github.com/davidmosiah/garmin-mcp/issues/19.
 *
 * Two rules:
 * 1. Stats are always computed on full-resolution samples, never on buckets.
 * 2. The payload is explicit about precision it does not have (`downsampled`,
 *    `source_points`, `returned_points`, `method`, `data_quality`).
 *
 * GPS/latlng never enters this module — it stays behind
 * `strava_get_activity_streams` with include_gps escalation.
 */

export const SERIES_CONTRACT_VERSION = "agent-safe-series/v1";

export const SERIES_HARD_MAX_POINTS = 500;
export const SERIES_DEFAULT_MAX_POINTS = 400;
export const SERIES_DEFAULT_RESOLUTION_SECONDS = 60;

/**
 * Metrics we expose as a series. Mapped to Strava stream keys below.
 * GPS is deliberately absent.
 */
export const SERIES_METRICS = ["heart_rate", "power", "cadence", "speed", "elevation"] as const;
export type SeriesMetric = (typeof SERIES_METRICS)[number];

/** Strava stream key for each series metric. */
export const STRAVA_STREAM_KEY: Record<SeriesMetric, string> = {
  heart_rate: "heartrate",
  power: "watts",
  cadence: "cadence",
  speed: "velocity_smooth",
  elevation: "altitude"
};

const METRIC_UNITS: Record<SeriesMetric, string> = {
  heart_rate: "bpm",
  power: "watts",
  cadence: "rpm",
  speed: "m/s",
  elevation: "m"
};

export type SeriesPoint = {
  t: number;
  value: number;
  min: number;
  max: number;
  samples: number;
};

export type SeriesStats = {
  avg: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  percentile_method: "linear_interpolation";
};

export type ZoneBucket = {
  zone: number;
  min_bpm: number;
  max_bpm: number | null;
  seconds: number;
  percent: number;
};

export type ReferenceSource =
  | "caller_provided"
  | "activity_recorded_max"
  | "observed_max";

export type CoverageAnchor = "nominal_duration" | "sample_span";

export type TimeInZone = {
  zone_model: "percent_of_reference_max_hr";
  reference_max_hr: number;
  reference_source: ReferenceSource;
  zones: ZoneBucket[];
};

export type DataQuality = {
  expected_samples: number;
  actual_samples: number;
  coverage_ratio: number;
  longest_gap_seconds: number;
  sample_interval_seconds: number;
  coverage_anchor: CoverageAnchor;
};

export type ActivitySeries = {
  contract_version: typeof SERIES_CONTRACT_VERSION;
  activity_id: string | number;
  metric: SeriesMetric;
  unit: string;
  start_time?: string;
  t_unit: "seconds_from_start";
  resolution_seconds: number;
  requested_resolution_seconds: number;
  points: SeriesPoint[];
  stats: SeriesStats;
  time_in_zone?: TimeInZone;
  downsampled: boolean;
  source_points: number;
  returned_points: number;
  method: "time_bucket_mean" | "none";
  data_quality: DataQuality;
  notes: string[];
};

interface RawSample {
  t: number;
  value: number;
}

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * q;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeStats(values: number[]): SeriesStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    avg: round(sum / values.length),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    p25: round(percentile(sorted, 0.25)),
    p50: round(percentile(sorted, 0.5)),
    p75: round(percentile(sorted, 0.75)),
    percentile_method: "linear_interpolation"
  };
}

export function computeTimeInZone(
  samples: RawSample[],
  sampleIntervalSeconds: number,
  referenceMaxHr: number,
  referenceSource: TimeInZone["reference_source"]
): TimeInZone {
  const bounds = [0.5, 0.6, 0.7, 0.8, 0.9].map((pct) => Math.round(referenceMaxHr * pct));
  const seconds = new Array(bounds.length).fill(0);

  for (const sample of samples) {
    let index = -1;
    for (let i = bounds.length - 1; i >= 0; i -= 1) {
      if (sample.value >= bounds[i]) {
        index = i;
        break;
      }
    }
    if (index >= 0) seconds[index] += sampleIntervalSeconds;
  }

  const total = seconds.reduce((acc, value) => acc + value, 0);
  return {
    zone_model: "percent_of_reference_max_hr",
    reference_max_hr: referenceMaxHr,
    reference_source: referenceSource,
    zones: bounds.map((min, index) => ({
      zone: index + 1,
      min_bpm: min,
      max_bpm: index === bounds.length - 1 ? null : bounds[index + 1] - 1,
      seconds: round(seconds[index], 1),
      percent: total > 0 ? round((seconds[index] / total) * 100, 1) : 0
    }))
  };
}

function medianInterval(samples: RawSample[]): number {
  if (samples.length < 2) return 1;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const delta = samples[i].t - samples[i - 1].t;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 1;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];
  return median > 0 ? median : 1;
}

export function computeDataQuality(
  samples: RawSample[],
  options: { nominalDurationSeconds?: number } = {}
): DataQuality {
  const interval = medianInterval(samples);
  const span = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0;

  let expected: number;
  let coverage_anchor: CoverageAnchor;
  const nominal = options.nominalDurationSeconds;
  if (typeof nominal === "number" && Number.isFinite(nominal) && nominal > 0) {
    expected = Math.round(nominal / interval) + 1;
    coverage_anchor = "nominal_duration";
  } else {
    expected = span > 0 ? Math.round(span / interval) + 1 : samples.length;
    coverage_anchor = "sample_span";
  }

  let longestGap = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const delta = samples[i].t - samples[i - 1].t;
    if (delta > longestGap) longestGap = delta;
  }

  if (coverage_anchor === "nominal_duration" && samples.length > 0 && typeof nominal === "number") {
    const headGap = Math.max(0, samples[0].t);
    const tailGap = Math.max(0, nominal - samples[samples.length - 1].t);
    const edge = Math.max(headGap, tailGap);
    if (edge > longestGap) longestGap = edge;
  }

  return {
    expected_samples: expected,
    actual_samples: samples.length,
    coverage_ratio: expected > 0 ? round(Math.min(samples.length / expected, 1), 3) : 1,
    longest_gap_seconds: round(longestGap, 1),
    sample_interval_seconds: round(interval, 2),
    coverage_anchor
  };
}

export function downsampleToBuckets(samples: RawSample[], resolutionSeconds: number): SeriesPoint[] {
  if (samples.length === 0) return [];
  const origin = samples[0].t;
  const buckets = new Map<number, { sum: number; min: number; max: number; count: number }>();

  for (const sample of samples) {
    const index = Math.floor((sample.t - origin) / resolutionSeconds);
    const bucket = buckets.get(index);
    if (bucket) {
      bucket.sum += sample.value;
      bucket.count += 1;
      if (sample.value < bucket.min) bucket.min = sample.value;
      if (sample.value > bucket.max) bucket.max = sample.value;
    } else {
      buckets.set(index, { sum: sample.value, min: sample.value, max: sample.value, count: 1 });
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, bucket]) => ({
      t: round(origin + index * resolutionSeconds, 1),
      value: round(bucket.sum / bucket.count),
      min: round(bucket.min),
      max: round(bucket.max),
      samples: bucket.count
    }));
}

export function resolveEffectiveResolution(
  samples: RawSample[],
  requestedResolutionSeconds: number,
  maxPoints: number
): number {
  if (samples.length === 0) return requestedResolutionSeconds;
  const span = samples[samples.length - 1].t - samples[0].t;
  if (span <= 0) return requestedResolutionSeconds;

  let resolution = requestedResolutionSeconds;
  const needed = Math.ceil(span / maxPoints);
  if (needed > resolution) resolution = needed;

  while (downsampleToBuckets(samples, resolution).length > maxPoints) {
    resolution += Math.max(1, Math.ceil(resolution * 0.1));
  }
  return resolution;
}

/**
 * Strava stream payload shapes we accept:
 * 1. key_by_type object: `{ heartrate: { data: number[] }, time: { data: number[] } }`
 * 2. array of streams: `[{ type: "heartrate", data: number[] }, ...]`
 */
export type StravaStreamsPayload = Record<string, unknown> | Array<Record<string, unknown>>;

function streamData(payload: StravaStreamsPayload, key: string): number[] | undefined {
  if (Array.isArray(payload)) {
    const stream = payload.find((item) => item?.type === key || item?.series_type === key);
    const data = stream?.data;
    return Array.isArray(data) ? data.map(Number) : undefined;
  }
  const entry = payload[key];
  if (!entry || typeof entry !== "object") return undefined;
  const data = (entry as { data?: unknown }).data;
  return Array.isArray(data) ? data.map(Number) : undefined;
}

/**
 * Pull one metric out of a Strava streams payload, paired with the time stream
 * when present. Nulls/NaNs are dropped (not zero-filled).
 */
export function extractSamples(payload: StravaStreamsPayload, metric: SeriesMetric): {
  samples: RawSample[];
  hasClock: boolean;
  hadLatlng: boolean;
} {
  const streamKey = STRAVA_STREAM_KEY[metric];
  const values = streamData(payload, streamKey);
  const times = streamData(payload, "time");
  const hadLatlng = Array.isArray(payload)
    ? payload.some((item) => item?.type === "latlng" || item?.series_type === "latlng")
    : Object.prototype.hasOwnProperty.call(payload, "latlng");

  if (!values || values.length === 0) {
    return { samples: [], hasClock: Boolean(times?.length), hadLatlng };
  }

  const samples: RawSample[] = [];
  const hasClock = Boolean(times && times.length > 0);
  const length = hasClock ? Math.min(values.length, times!.length) : values.length;

  for (let i = 0; i < length; i += 1) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(Number(value))) continue;
    let t: number;
    if (hasClock) {
      const rawT = times![i];
      if (rawT === null || rawT === undefined || !Number.isFinite(Number(rawT))) continue;
      t = Number(rawT);
    } else {
      t = i;
    }
    samples.push({ t, value: Number(value) });
  }

  samples.sort((a, b) => a.t - b.t);
  return { samples, hasClock, hadLatlng };
}

/** Nominal duration (seconds) from a Strava activity summary. Prefer elapsed_time. */
export function pickActivityDurationSeconds(summary: Record<string, unknown> | null | undefined): number | undefined {
  if (!summary || typeof summary !== "object") return undefined;
  for (const key of ["elapsed_time", "moving_time", "elapsedTime", "movingTime"]) {
    const n = Number(summary[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Recorded max HR from a Strava activity summary. */
export function pickActivityMaxHr(summary: Record<string, unknown> | null | undefined): number | undefined {
  if (!summary || typeof summary !== "object") return undefined;
  for (const key of ["max_heartrate", "maxHeartrate", "max_heart_rate"]) {
    const n = Number(summary[key]);
    if (Number.isFinite(n) && n >= 100 && n <= 240) return n;
  }
  return undefined;
}

/** Start clock from a Strava activity summary. */
export function pickActivityStartTime(summary: Record<string, unknown> | null | undefined): string | undefined {
  if (!summary || typeof summary !== "object") return undefined;
  for (const key of ["start_date", "start_date_local", "startDate", "startDateLocal"]) {
    const value = summary[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export interface BuildActivitySeriesOptions {
  activityId: string | number;
  metric: SeriesMetric;
  resolutionSeconds?: number;
  maxPoints?: number;
  referenceMaxHr?: number;
  activityRecordedMaxHr?: number;
  nominalDurationSeconds?: number;
  startTime?: string;
}

export function buildActivitySeries(
  payload: StravaStreamsPayload,
  options: BuildActivitySeriesOptions
): ActivitySeries {
  const {
    activityId,
    metric,
    resolutionSeconds = SERIES_DEFAULT_RESOLUTION_SECONDS,
    maxPoints = SERIES_DEFAULT_MAX_POINTS,
    referenceMaxHr,
    activityRecordedMaxHr,
    nominalDurationSeconds,
    startTime
  } = options;

  const budget = Math.min(Math.max(1, Math.trunc(maxPoints)), SERIES_HARD_MAX_POINTS);
  const requested = Math.max(1, Math.trunc(resolutionSeconds));
  const notes: string[] = [];

  const { samples, hasClock, hadLatlng } = extractSamples(payload, metric);
  if (hadLatlng) {
    notes.push("Positional latlng stream present upstream was ignored; GPS never enters a series response.");
  }
  if (samples.length === 0) {
    throw new Error(
      `No ${metric} samples in activity ${activityId}. Strava did not return the ${STRAVA_STREAM_KEY[metric]} stream, or every sample was empty.`
    );
  }
  if (!hasClock) {
    notes.push("No time stream in payload; sample index was used as a 1 Hz clock.");
  }

  const values = samples.map((sample) => sample.value);
  const stats = computeStats(values);
  const dataQuality = computeDataQuality(samples, { nominalDurationSeconds });

  const effective = resolveEffectiveResolution(samples, requested, budget);
  if (effective !== requested) {
    notes.push(
      `Requested ${requested}s resolution would exceed max_points=${budget}; served at ${effective}s instead.`
    );
  }

  const shouldDownsample = effective > dataQuality.sample_interval_seconds && samples.length > budget;
  const points: SeriesPoint[] = shouldDownsample
    ? downsampleToBuckets(samples, effective)
    : samples.map((sample) => ({
        t: round(sample.t, 1),
        value: round(sample.value),
        min: round(sample.value),
        max: round(sample.value),
        samples: 1
      }));

  if (dataQuality.coverage_ratio < 0.9) {
    notes.push(
      `Sparse series: ${dataQuality.actual_samples} of ~${dataQuality.expected_samples} expected samples ` +
        `(anchor=${dataQuality.coverage_anchor}, longest gap ${dataQuality.longest_gap_seconds}s). Treat the shape as indicative.`
    );
  }

  let timeInZone: TimeInZone | undefined;
  if (metric === "heart_rate") {
    let source: ReferenceSource;
    let reference: number;
    if (referenceMaxHr !== undefined) {
      source = "caller_provided";
      reference = referenceMaxHr;
    } else if (
      typeof activityRecordedMaxHr === "number" &&
      Number.isFinite(activityRecordedMaxHr) &&
      activityRecordedMaxHr > 0
    ) {
      source = "activity_recorded_max";
      reference = Math.round(activityRecordedMaxHr);
    } else {
      source = "observed_max";
      reference = Math.round(stats.max);
    }
    timeInZone = computeTimeInZone(samples, dataQuality.sample_interval_seconds, reference, source);
    if (source !== "caller_provided") {
      notes.push(
        `reference_max_hr source=${source}. Pass reference_max_hr for zones that compare across activities.`
      );
    }
  }

  return {
    contract_version: SERIES_CONTRACT_VERSION,
    activity_id: activityId,
    metric,
    unit: METRIC_UNITS[metric],
    start_time: startTime,
    t_unit: "seconds_from_start",
    resolution_seconds: shouldDownsample ? effective : round(dataQuality.sample_interval_seconds, 2),
    requested_resolution_seconds: requested,
    points,
    stats,
    time_in_zone: timeInZone,
    downsampled: shouldDownsample,
    source_points: samples.length,
    returned_points: points.length,
    method: shouldDownsample ? "time_bucket_mean" : "none",
    data_quality: dataQuality,
    notes
  };
}
