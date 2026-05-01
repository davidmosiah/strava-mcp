import type { PrivacyMode, StravaConfig } from "../types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function first(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function pickDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

export function resolvePrivacyMode(config: StravaConfig, override?: PrivacyMode): PrivacyMode {
  return override ?? config.privacyMode;
}

export function applyPrivacy(endpoint: string, payload: unknown, mode: PrivacyMode): unknown {
  if (mode === "raw") return payload;
  if (isObject(payload) && Array.isArray(payload.records)) {
    return {
      ...payload,
      privacy_mode: mode,
      records: payload.records.map((record) => normalizeRecord(endpoint, record, mode))
    };
  }
  if (Array.isArray(payload)) return payload.map((record) => normalizeRecord(endpoint, record, mode));
  return normalizeRecord(endpoint, payload, mode);
}

export function normalizeRecord(endpoint: string, record: unknown, mode: PrivacyMode): unknown {
  if (!isObject(record)) return record;
  if (endpoint === "/athlete") return normalizeAthlete(record, mode);
  if (endpoint.includes("/athlete/zones")) return record;
  if (endpoint.includes("/athletes/") && endpoint.includes("/stats")) return record;
  if (endpoint.includes("/activities") && endpoint.includes("/streams")) return normalizeStreams(record, mode, false);
  if (endpoint.includes("/activities") && endpoint.includes("/zones")) return record;
  if (endpoint.includes("/activities")) return normalizeActivity(record, mode);
  if (endpoint.includes("/routes")) return normalizeRoute(record, mode);
  if (endpoint.includes("/clubs")) return normalizeClub(record, mode);
  if (endpoint.includes("/gear/")) return normalizeGear(record, mode);
  return mode === "summary" ? pickDefined({ id: record.id, name: record.name }) : removeGps(record);
}

export function normalizeStreams(payload: unknown, mode: PrivacyMode, includeGps: boolean): unknown {
  if (mode === "raw") return payload;
  if (!isObject(payload)) return payload;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "latlng" && !includeGps) continue;
    if (mode === "summary" && Array.isArray((value as { data?: unknown }).data)) {
      const data = (value as { data: unknown[] }).data;
      output[key] = { type: key, original_size: data.length, preview: data.slice(0, 12) };
    } else {
      output[key] = value;
    }
  }
  return output;
}

function normalizeAthlete(record: Record<string, unknown>, mode: PrivacyMode): Record<string, unknown> {
  const base = pickDefined({
    id: record.id,
    username: record.username,
    firstname: record.firstname,
    city: mode === "summary" ? undefined : record.city,
    state: mode === "summary" ? undefined : record.state,
    country: mode === "summary" ? undefined : record.country,
    sex: mode === "summary" ? undefined : record.sex,
    premium: record.premium,
    summit: record.summit
  });
  if (mode === "summary") return base;
  return pickDefined({
    ...base,
    lastname: record.lastname,
    created_at: record.created_at,
    updated_at: record.updated_at,
    follower_count: record.follower_count,
    friend_count: record.friend_count,
    measurement_preference: record.measurement_preference,
    ftp: record.ftp,
    weight: record.weight
  });
}

function normalizeActivity(record: Record<string, unknown>, mode: PrivacyMode): Record<string, unknown> {
  const base = pickDefined({
    id: record.id,
    name: record.name,
    sport_type: first(record, ["sport_type", "type"]),
    start_date: record.start_date,
    start_date_local: record.start_date_local,
    timezone: record.timezone,
    distance: record.distance,
    moving_time: record.moving_time,
    elapsed_time: record.elapsed_time,
    total_elevation_gain: record.total_elevation_gain,
    average_speed: record.average_speed,
    max_speed: record.max_speed,
    average_heartrate: record.average_heartrate,
    max_heartrate: record.max_heartrate,
    average_watts: record.average_watts,
    weighted_average_watts: record.weighted_average_watts,
    suffer_score: record.suffer_score,
    relative_effort: record.relative_effort,
    trainer: record.trainer,
    commute: record.commute,
    private: record.private
  });
  if (mode === "summary") return base;
  return pickDefined({
    ...base,
    achievement_count: record.achievement_count,
    kudos_count: record.kudos_count,
    comment_count: record.comment_count,
    athlete_count: record.athlete_count,
    workout_type: record.workout_type,
    device_name: record.device_name,
    gear_id: record.gear_id,
    calories: record.calories,
    has_heartrate: record.has_heartrate,
    elev_high: record.elev_high,
    elev_low: record.elev_low,
    splits_metric: record.splits_metric,
    laps: record.laps,
    best_efforts: record.best_efforts,
    segment_efforts: record.segment_efforts
  });
}

function normalizeRoute(record: Record<string, unknown>, mode: PrivacyMode): Record<string, unknown> {
  const base = pickDefined({
    id: record.id,
    id_str: record.id_str,
    name: record.name,
    description: record.description,
    distance: record.distance,
    elevation_gain: record.elevation_gain,
    type: record.type,
    sub_type: record.sub_type,
    private: record.private,
    starred: record.starred
  });
  if (mode === "summary") return base;
  return pickDefined({
    ...base,
    created_at: record.created_at,
    updated_at: record.updated_at,
    estimated_moving_time: record.estimated_moving_time,
    segments: record.segments,
    map: summarizeMap(record.map)
  });
}

function normalizeClub(record: Record<string, unknown>, mode: PrivacyMode): Record<string, unknown> {
  const base = pickDefined({ id: record.id, name: record.name, sport_type: record.sport_type, member_count: record.member_count, private: record.private });
  if (mode === "summary") return base;
  return pickDefined({ ...base, city: record.city, state: record.state, country: record.country, verified: record.verified, url: record.url });
}

function normalizeGear(record: Record<string, unknown>, mode: PrivacyMode): Record<string, unknown> {
  const base = pickDefined({ id: record.id, name: record.name, distance: record.distance, primary: record.primary });
  if (mode === "summary") return base;
  return pickDefined({ ...base, brand_name: record.brand_name, model_name: record.model_name, description: record.description, retired: record.retired });
}

function removeGps(record: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...record };
  for (const key of ["start_latlng", "end_latlng", "location_city", "location_state", "location_country", "map", "polyline", "summary_polyline"]) {
    delete clone[key];
  }
  return clone;
}

function summarizeMap(value: unknown): unknown {
  if (!isObject(value)) return undefined;
  return pickDefined({ id: value.id, resource_state: value.resource_state, has_polyline: Boolean(value.polyline || value.summary_polyline) });
}
