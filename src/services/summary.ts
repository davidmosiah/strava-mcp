import type { StravaClient } from "./strava-client.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_S = 60 * 60;

type UnknownRecord = Record<string, unknown>;

export interface SummaryOptions {
  days: number;
  compare_days?: number;
  timezone?: string;
}

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function num(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function str(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function dateMs(record: UnknownRecord): number {
  const value = str(record, ["start_date", "start_date_local", "created_at"]);
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value?: number, digits = 1): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}

function avg(values: Array<number | undefined>): number | undefined {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return nums.length ? sum(nums) / nums.length : undefined;
}

function percentDelta(current?: number, previous?: number): number | undefined {
  if (current === undefined || previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

async function fetchActivities(client: Pick<StravaClient, "list">, days: number): Promise<{ activities: UnknownRecord[]; pages_fetched: number }> {
  const result = await client.list("/athlete/activities", { after: isoDaysAgo(days), limit: 100, all_pages: true, max_pages: 4 });
  return { activities: result.records.filter(isObject).sort((a, b) => dateMs(b) - dateMs(a)), pages_fetched: result.pages_fetched };
}

function sport(record: UnknownRecord): string {
  return str(record, ["sport_type", "type"]) ?? "Activity";
}

function movingHours(record: UnknownRecord): number | undefined {
  const seconds = num(record, ["moving_time"]);
  return seconds === undefined ? undefined : seconds / HOUR_S;
}

function distanceKm(record: UnknownRecord): number | undefined {
  const meters = num(record, ["distance"]);
  return meters === undefined ? undefined : meters / 1000;
}

function elevationM(record: UnknownRecord): number | undefined {
  return num(record, ["total_elevation_gain", "elevation_gain"]);
}

function effort(record: UnknownRecord): number | undefined {
  return num(record, ["suffer_score", "relative_effort"]);
}

function weekStats(records: UnknownRecord[]) {
  const sports = new Map<string, number>();
  for (const record of records) sports.set(sport(record), (sports.get(sport(record)) ?? 0) + 1);
  const topSports = [...sports.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return {
    activity_count: records.length,
    distance_km: round(sum(records.map(distanceKm)), 2),
    moving_hours: round(sum(records.map(movingHours)), 2),
    elevation_m: round(sum(records.map(elevationM)), 0),
    total_relative_effort: round(sum(records.map(effort)), 0),
    avg_heartrate: round(avg(records.map((record) => num(record, ["average_heartrate"]))), 0),
    avg_watts: round(avg(records.map((record) => num(record, ["weighted_average_watts", "average_watts"]))), 0),
    top_sports: topSports
  };
}

function classifyLoad(stats: ReturnType<typeof weekStats>): string {
  const hours = stats.moving_hours ?? 0;
  const effortScore = stats.total_relative_effort ?? 0;
  if (hours >= 8 || effortScore >= 450) return "high";
  if (hours >= 4 || effortScore >= 180) return "moderate";
  if (hours > 0) return "light";
  return "none";
}

function buildActions(params: { latest?: UnknownRecord; stats: ReturnType<typeof weekStats>; load: string; prior?: ReturnType<typeof weekStats> }): string[] {
  const actions: string[] = [];
  const volumeDelta = percentDelta(params.stats.moving_hours, params.prior?.moving_hours);
  if (params.load === "high") actions.push("Protect recovery: avoid stacking another maximal session until sleep, soreness and energy are clearly stable.");
  if (params.load === "moderate") actions.push("Use one quality session and keep the remaining work aerobic or technical.");
  if (params.load === "light") actions.push("If readiness feels good, add controlled zone 2 volume before adding intensity.");
  if (params.load === "none") actions.push("Rebuild rhythm with a short easy session before chasing performance metrics.");
  if (volumeDelta !== undefined && volumeDelta > 35) actions.push("Volume jumped more than 35%; treat the next 24-48h as consolidation, not escalation.");
  if ((params.stats.avg_heartrate ?? 0) > 0 && !params.stats.total_relative_effort) actions.push("Relative effort is missing; use heart rate, pace/power and perceived exertion together instead of one metric.");
  const latestSport = params.latest ? sport(params.latest) : undefined;
  if (latestSport) actions.push(`Review the latest ${latestSport} for intensity drift, hydration/fueling notes and whether it matches the intended session.`);
  actions.push("Keep GPS privacy in mind before sharing raw route or stream payloads with any agent.");
  return [...new Set(actions)];
}

export async function buildDailySummary(client: Pick<StravaClient, "list">, options: SummaryOptions) {
  const days = Math.max(options.days, 1);
  const bundle = await fetchActivities(client, Math.max(days, 7));
  const activities = bundle.activities;
  const latest = activities[0];
  const stats = weekStats(activities.filter((activity) => Date.now() - dateMs(activity) <= days * DAY_MS));
  const load = classifyLoad(stats);
  const actions = buildActions({ latest, stats, load });

  return {
    kind: "daily_summary" as const,
    generated_at: new Date().toISOString(),
    window: { days, timezone: options.timezone ?? "UTC" },
    data_quality: {
      confidence: activities.length >= 5 ? "high" : activities.length >= 2 ? "medium" : "low",
      activities: activities.length,
      pages_fetched: bundle.pages_fetched,
      note: "Strava provides activity/training data, not WHOOP-style recovery or sleep readiness. Pair with WHOOP/Garmin/Oura for physiology."
    },
    latest_activity: latest ? {
      id: latest.id,
      name: latest.name,
      sport_type: sport(latest),
      start_date: str(latest, ["start_date", "start_date_local"]),
      distance_km: round(distanceKm(latest), 2),
      moving_minutes: round((movingHours(latest) ?? 0) * 60, 0),
      elevation_m: round(elevationM(latest), 0),
      avg_hr: num(latest, ["average_heartrate"]),
      max_hr: num(latest, ["max_heartrate"]),
      avg_power: num(latest, ["weighted_average_watts", "average_watts"]),
      relative_effort: effort(latest)
    } : undefined,
    training_load: {
      classification: load,
      stats
    },
    diagnostic: {
      primary_signal: load === "high" ? "Recent Strava load is high enough that recovery discipline matters." : "Recent Strava load is manageable; use intent and consistency as the main lever.",
      action_candidates: actions
    },
    safety: {
      medical_advice: false,
      gps_privacy_default: "summary and structured outputs avoid raw GPS streams unless explicitly requested"
    }
  };
}

export async function buildWeeklySummary(client: Pick<StravaClient, "list">, options: SummaryOptions) {
  const days = Math.max(options.days, 7);
  const compareDays = options.compare_days ?? 7;
  const bundle = await fetchActivities(client, days + compareDays + 2);
  const now = Date.now();
  const current = bundle.activities.filter((activity) => now - dateMs(activity) <= days * DAY_MS);
  const previous = compareDays > 0
    ? bundle.activities.filter((activity) => now - dateMs(activity) > days * DAY_MS && now - dateMs(activity) <= (days + compareDays) * DAY_MS)
    : [];
  const currentStats = weekStats(current);
  const previousStats = previous.length ? weekStats(previous) : undefined;
  const load = classifyLoad(currentStats);
  const actions = buildActions({ latest: current[0], stats: currentStats, prior: previousStats, load });

  return {
    kind: "weekly_summary" as const,
    generated_at: new Date().toISOString(),
    window: { days, compare_days: compareDays, timezone: options.timezone ?? "UTC" },
    data_quality: {
      confidence: current.length >= 4 ? "high" : current.length >= 2 ? "medium" : "low",
      activities: current.length,
      comparison_activities: previous.length,
      pages_fetched: bundle.pages_fetched
    },
    scorecard: {
      current: currentStats,
      previous: previousStats,
      delta: previousStats ? {
        distance_pct: round(percentDelta(currentStats.distance_km, previousStats.distance_km), 1),
        moving_hours_pct: round(percentDelta(currentStats.moving_hours, previousStats.moving_hours), 1),
        elevation_pct: round(percentDelta(currentStats.elevation_m, previousStats.elevation_m), 1),
        relative_effort_pct: round(percentDelta(currentStats.total_relative_effort, previousStats.total_relative_effort), 1)
      } : undefined
    },
    diagnostic: {
      load_classification: load,
      bottlenecks: inferBottlenecks(currentStats, previousStats),
      action_candidates: actions,
      next_week_success_metrics: [
        "Keep weekly volume change within a controlled range unless deliberately peaking.",
        "Separate hard sessions with easy/recovery work.",
        "Use route/stream raw payloads only when GPS detail is necessary.",
        "Pair Strava load with sleep/recovery data before making aggressive training changes."
      ]
    },
    safety: {
      medical_advice: false,
      raw_sensor_boundary: "Strava streams are activity streams, not continuous 24/7 raw sensor telemetry."
    }
  };
}

function inferBottlenecks(current: ReturnType<typeof weekStats>, previous?: ReturnType<typeof weekStats>): string[] {
  const bottlenecks: string[] = [];
  const hoursDelta = percentDelta(current.moving_hours, previous?.moving_hours);
  const effortDelta = percentDelta(current.total_relative_effort, previous?.total_relative_effort);
  if (hoursDelta !== undefined && hoursDelta > 35) bottlenecks.push("Training volume increased sharply versus the comparison window.");
  if (effortDelta !== undefined && effortDelta > 45) bottlenecks.push("Relative effort rose faster than volume; intensity may be the main fatigue driver.");
  if ((current.activity_count ?? 0) <= 1) bottlenecks.push("Low activity count limits pattern confidence.");
  if (!current.avg_heartrate && !current.avg_watts) bottlenecks.push("Missing heart-rate/power fields limits intensity diagnosis.");
  if (!bottlenecks.length) bottlenecks.push("No obvious Strava-only bottleneck; inspect sleep, soreness, HRV and life stress before changing load.");
  return bottlenecks;
}

export function formatSummaryMarkdown(summary: Record<string, unknown>): string {
  const lines = [`# Strava ${summary.kind === "weekly_summary" ? "Weekly" : "Daily"} Summary`, ""];
  lines.push(`Generated: ${summary.generated_at}`);
  const diagnostic = summary.diagnostic as { primary_signal?: string; load_classification?: string; action_candidates?: string[]; bottlenecks?: string[] } | undefined;
  if (diagnostic?.primary_signal) lines.push(`\n## Primary signal\n${diagnostic.primary_signal}`);
  if (diagnostic?.load_classification) lines.push(`\n## Load\n${diagnostic.load_classification}`);
  if (diagnostic?.bottlenecks?.length) {
    lines.push("\n## Bottlenecks");
    diagnostic.bottlenecks.forEach((item) => lines.push(`- ${item}`));
  }
  if (diagnostic?.action_candidates?.length) {
    lines.push("\n## Action candidates");
    diagnostic.action_candidates.forEach((item) => lines.push(`- ${item}`));
  }
  return lines.join("\n");
}
