import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const TimezoneArg = z.string().default("UTC").describe("IANA timezone for interpreting daily/weekly summaries.");

function userPrompt(text: string) {
  return {
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text }
    }]
  };
}

export function registerStravaPrompts(server: McpServer): void {
  server.registerPrompt(
    "strava_daily_training_director",
    {
      title: "Strava Daily Training Director",
      description: "Use Strava activity context to produce a practical daily training and recovery plan.",
      argsSchema: { timezone: TimezoneArg }
    },
    ({ timezone }) => userPrompt(`Call strava_daily_summary with timezone=${timezone || "UTC"} and response_format=json. Use the result to produce a concise training brief.

Requirements:
- Do not provide medical diagnosis or treatment advice.
- Lead with the training-load signal.
- Explain latest activity, weekly load and intensity only using returned metrics.
- Give 3-5 concrete actions for training, recovery, route choice and focus today.
- Mention that Strava does not provide WHOOP-style recovery/sleep readiness.`)
  );

  server.registerPrompt(
    "strava_weekly_endurance_review",
    {
      title: "Strava Weekly Endurance Review",
      description: "Use Strava weekly summary data to create a next-week training plan.",
      argsSchema: { timezone: TimezoneArg }
    },
    ({ timezone }) => userPrompt(`Call strava_weekly_summary with timezone=${timezone || "UTC"}, days=7, compare_days=7 and response_format=json. Create a weekly endurance review.

Requirements:
- Compare current vs prior window only where data exists.
- Identify the biggest load/intensity/consistency bottleneck.
- Create a next-week plan with one quality session, aerobic support, recovery spacing and route guidance.
- Include measurable success metrics.
- Avoid medical advice.`)
  );

  server.registerPrompt(
    "strava_activity_stream_investigator",
    {
      title: "Strava Activity Stream Investigator",
      description: "Investigate one Strava activity with agent-safe series (prefer series over raw streams) while respecting GPS privacy.",
      argsSchema: { activity_id: z.string().describe("Strava activity id"), include_gps: z.string().default("false") }
    },
    ({ activity_id, include_gps }) => userPrompt(`Call strava_get_activity with id=${activity_id} and response_format=json. Then call strava_activity_series with id=${activity_id}, metric=heart_rate, response_format=json (agent-safe-series/v1 — exact stats + bounded points). Only call strava_get_activity_streams if you need multi-key raw streams; set include_gps=${include_gps === "true" ? "true" : "false"} and only with explicit user consent for GPS.

Return:
- what the session appears to be training
- pacing / HR / power drift if available (use series stats and notes)
- 2-4 technical takeaways
- whether GPS detail was used

Do not expose raw GPS unless the user explicitly requested it. Prefer series over dumping full streams into context.`)
  );
}
