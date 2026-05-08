import type { StravaClient } from "./strava-client.js";
import { buildDailySummary, type SummaryOptions } from "./summary.js";

type ContextOptions = SummaryOptions & {
  soreness?: string[];
  injury_flags?: string[];
  notes?: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeLoad(value: unknown): "low" | "normal" | "high" | "unknown" {
  if (value === "high") return "high";
  if (value === "moderate") return "normal";
  if (value === "light" || value === "none") return "low";
  return "unknown";
}

export async function buildTrainingContext(client: Pick<StravaClient, "list">, options: ContextOptions) {
  const summary = await buildDailySummary(client as StravaClient, options);
  const latest = record(summary.latest_activity);
  const trainingLoad = record(summary.training_load);
  const stats = record(trainingLoad.stats);
  const activityCount = num(stats.activity_count) ?? 0;
  const recentTrainingLoad = normalizeLoad(trainingLoad.classification);
  const weeklyMinutes = num(stats.moving_hours) === undefined ? undefined : Math.round((num(stats.moving_hours) as number) * 60);
  const relativeEffort = num(stats.total_relative_effort);
  const fallback_hint = activityCount === 0
    ? "Sem Strava recente; combine com WHOOP/Garmin/Oura ou input manual."
    : undefined;

  return {
    source: "strava",
    context_contract_version: "delx-wellness-context/v1",
    context_type: "training_context",
    generated_at: summary.generated_at,
    recent_training_load: recentTrainingLoad,
    last_activity_type: latest.sport_type,
    weekly_minutes: weeklyMinutes,
    relative_effort: relativeEffort,
    privacy: {
      gps: "withheld_from_context",
      route_details: "not_included",
    },
    recommended_handoff: {
      tool: "exercise_catalog_recommend_session",
      reason: "Use recent Strava training load to avoid stacking hard sessions without recovery context.",
    },
    soreness_hint: recentTrainingLoad === "high" ? 1 : 0,
    soreness: options.soreness ?? [],
    injury_flags: options.injury_flags ?? [],
    notes: [fallback_hint, options.notes].filter((note): note is string => Boolean(note)),
    data_quality: summary.data_quality,
    fallback_hint,
    telegram_summary: [
      "Strava training context",
      latest.sport_type ? `Last: ${String(latest.sport_type)}` : undefined,
      weeklyMinutes !== undefined ? `Weekly: ${weeklyMinutes}min` : undefined,
      relativeEffort !== undefined ? `Effort: ${relativeEffort}` : undefined,
      `Load: ${recentTrainingLoad}`
    ].filter(Boolean).join(" | ")
  };
}

export function formatTrainingContextMarkdown(context: Record<string, unknown>): string {
  const lines = ["# Strava Training Context", ""];
  for (const key of ["context_contract_version", "context_type", "recent_training_load", "last_activity_type", "weekly_minutes", "relative_effort", "fallback_hint"]) {
    if (context[key] !== undefined) lines.push(`- **${key}**: ${String(context[key])}`);
  }

  const privacy = record(context.privacy);
  if (privacy.gps !== undefined || privacy.route_details !== undefined) {
    lines.push("", "## Privacy");
    if (privacy.gps !== undefined) lines.push(`- **gps**: ${String(privacy.gps)}`);
    if (privacy.route_details !== undefined) lines.push(`- **route_details**: ${String(privacy.route_details)}`);
  }

  const handoff = record(context.recommended_handoff);
  if (handoff.tool !== undefined || handoff.reason !== undefined) {
    lines.push("", "## Recommended Handoff");
    if (handoff.tool !== undefined) lines.push(`- **tool**: ${String(handoff.tool)}`);
    if (handoff.reason !== undefined) lines.push(`- **reason**: ${String(handoff.reason)}`);
  }

  return lines.join("\n");
}
