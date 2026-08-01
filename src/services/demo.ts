/**
 * Synthetic example payloads for `strava_demo`.
 *
 * The stated purpose of the demo tool is that agents see the contract *before*
 * calling the real Strava API. That only holds if the examples match what the
 * builders actually return — an example advertising a field the server never
 * emits makes an agent write a parser for data that never arrives, and an
 * example omitting a real field hides half the payload.
 *
 * These shapes are not hand-maintained guesses: `scripts/demo-contract-test.mjs`
 * runs the real `buildDailySummary` / `buildTrainingContext` /
 * `buildCollectionOutput` over `fixtures/strava-activities.mjs` and fails the
 * build when the key sets diverge in either direction.
 *
 * If you change a builder's output shape, that gate fails and points here.
 * Update this file — do not weaken the gate.
 *
 * Every value is fabricated. Ids sit in an obviously fake 99xxxxxxxxx range and
 * no GPS field appears at any depth, mirroring the connector's default
 * redaction.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const DEMO_NOTES = [
  "All sample data is synthetic; tagged with is_demo=true.",
  "Real calls return live data from the Strava v3 API after OAuth setup.",
  "GPS latlng and route geometry are omitted by default; the demo payload mirrors that defensive shape.",
  "Shapes are verified against the real builders by scripts/demo-contract-test.mjs."
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** One representative response, matching the shape of `buildDailySummary`. */
function demoDailySummary() {
  return {
    kind: "daily_summary",
    generated_at: new Date().toISOString(),
    window: {
      days: 7,
      timezone: "America/Fortaleza"
    },
    data_quality: {
      confidence: "medium",
      activities: 4,
      pages_fetched: 1,
      note: "Strava provides activity/training data, not WHOOP-style recovery or sleep readiness. Pair with WHOOP/Garmin/Oura for physiology."
    },
    latest_activity: {
      id: 99100000001,
      name: "Sunrise base ride",
      sport_type: "Ride",
      start_date: isoDaysAgo(1),
      distance_km: 32.41,
      moving_minutes: 72,
      elevation_m: 214,
      avg_hr: 131.4,
      max_hr: 158,
      avg_power: 163,
      relative_effort: 64
    },
    training_load: {
      classification: "moderate",
      stats: {
        activity_count: 3,
        distance_km: 45.45,
        moving_hours: 2.4,
        elevation_m: 314,
        total_relative_effort: 174,
        avg_heartrate: 146,
        avg_watts: 163,
        top_sports: [
          { name: "Run", count: 2 },
          { name: "Ride", count: 1 }
        ]
      }
    },
    diagnostic: {
      primary_signal: "Recent Strava load is manageable; use intent and consistency as the main lever.",
      action_candidates: [
        "Use one quality session and keep the remaining work aerobic or technical.",
        "Review the latest Ride for intensity drift, hydration/fueling notes and whether it matches the intended session.",
        "Keep GPS privacy in mind before sharing raw route or stream payloads with any agent."
      ]
    },
    safety: {
      medical_advice: false,
      gps_privacy_default: "summary and structured outputs avoid raw GPS streams unless explicitly requested"
    }
  };
}

/** One representative response, matching the shape of `buildTrainingContext`. */
function demoTrainingContext() {
  return {
    source: "strava",
    context_contract_version: "delx-wellness-context/v1",
    context_type: "training_context",
    generated_at: new Date().toISOString(),
    recent_training_load: "normal",
    last_activity_type: "Ride",
    weekly_minutes: 144,
    relative_effort: 174,
    privacy: {
      gps: "withheld_from_context",
      route_details: "not_included"
    },
    recommended_handoff: {
      tool: "exercise_catalog_recommend_session",
      reason: "Use recent Strava training load to avoid stacking hard sessions without recovery context."
    },
    soreness_hint: 0,
    soreness: [] as string[],
    injury_flags: [] as string[],
    notes: [] as string[],
    data_quality: {
      confidence: "medium",
      activities: 4,
      pages_fetched: 1,
      note: "Strava provides activity/training data, not WHOOP-style recovery or sleep readiness. Pair with WHOOP/Garmin/Oura for physiology."
    },
    telegram_summary: "Strava training context | Last: Ride | Weekly: 144min | Effort: 174 | Load: normal"
  };
}

/**
 * One representative response, matching the shape of `strava_list_activities`
 * in the default `structured` privacy mode.
 *
 * Structured mode keeps every Strava field except the GPS-bearing ones, so the
 * record is wide on purpose: that is what an agent has to parse. The two
 * records differ the way real ones do — a ride carries power and kilojoules and
 * no `workout_type`, a run carries `workout_type` and no power.
 */
function demoListActivities() {
  return {
    endpoint: "/athlete/activities",
    privacy_mode: "structured",
    count: 4,
    records: [
      {
        id: 99100000001,
        name: "Sunrise base ride",
        sport_type: "Ride",
        start_date: isoDaysAgo(1),
        start_date_local: isoDaysAgo(1),
        timezone: "(GMT-03:00) America/Fortaleza",
        distance: 32410.5,
        moving_time: 4320,
        elapsed_time: 4515,
        total_elevation_gain: 214,
        average_speed: 7.5,
        max_speed: 12.9,
        average_heartrate: 131.4,
        max_heartrate: 158,
        average_watts: 148.2,
        weighted_average_watts: 163,
        suffer_score: 64,
        trainer: false,
        commute: false,
        private: false,
        achievement_count: 1,
        kudos_count: 6,
        comment_count: 0,
        athlete_count: 2,
        device_name: "Synthetic Bike Computer B1",
        gear_id: "b99000456",
        calories: 612,
        has_heartrate: true,
        elev_high: 88.3,
        elev_low: 4.2,
        resource_state: 2,
        athlete: { id: 99000001, resource_state: 1 },
        type: "Ride",
        utc_offset: -10800,
        photo_count: 0,
        manual: false,
        visibility: "everyone",
        flagged: false,
        average_cadence: 82.4,
        kilojoules: 640.1,
        device_watts: true,
        heartrate_opt_out: false,
        display_hide_heartrate_option: true,
        upload_id: 99200000001,
        upload_id_str: "99200000001",
        external_id: "synthetic-ride-1.fit",
        from_accepted_tag: false,
        pr_count: 0,
        total_photo_count: 0,
        has_kudoed: false
      },
      {
        id: 99100000002,
        name: "Tempo intervals",
        sport_type: "Run",
        start_date: isoDaysAgo(2),
        start_date_local: isoDaysAgo(2),
        timezone: "(GMT-03:00) America/Fortaleza",
        distance: 8024.9,
        moving_time: 2640,
        elapsed_time: 2810,
        total_elevation_gain: 58,
        average_speed: 3.04,
        max_speed: 4.62,
        average_heartrate: 165.1,
        max_heartrate: 181,
        suffer_score: 78,
        trainer: false,
        commute: false,
        private: false,
        achievement_count: 3,
        kudos_count: 9,
        comment_count: 1,
        athlete_count: 1,
        workout_type: 3,
        device_name: "Synthetic Watch S1",
        gear_id: "g99000123",
        calories: 602,
        has_heartrate: true,
        elev_high: 41,
        elev_low: 5.4,
        resource_state: 2,
        athlete: { id: 99000001, resource_state: 1 },
        type: "Run",
        utc_offset: -10800,
        photo_count: 0,
        manual: false,
        visibility: "everyone",
        flagged: false,
        average_cadence: 87.5,
        heartrate_opt_out: false,
        display_hide_heartrate_option: true,
        upload_id: 99200000002,
        upload_id_str: "99200000002",
        external_id: "synthetic-run-1.fit",
        from_accepted_tag: false,
        pr_count: 1,
        total_photo_count: 0,
        has_kudoed: false
      }
    ],
    next_page: 2,
    has_more: true,
    pages_fetched: 1
  };
}

export function buildDemoPayload() {
  return {
    ok: true,
    is_demo: true,
    sample: {
      strava_daily_summary: demoDailySummary(),
      strava_training_context: demoTrainingContext(),
      strava_list_activities: demoListActivities()
    },
    notes: DEMO_NOTES
  };
}
