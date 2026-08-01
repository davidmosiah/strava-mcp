/**
 * Synthetic Strava `/athlete/activities` records used by the demo contract gate.
 *
 * These are shaped like a real Strava v3 `SummaryActivity` — including the
 * GPS-bearing fields the API sends and this connector strips — so the gate runs
 * the REAL builders and the REAL privacy normalizer over a realistic input
 * instead of a convenient one.
 *
 * Everything here is fabricated: ids are in an obviously fake 99xxxxxxxxx range
 * and every coordinate is a literal zero. No real athlete data belongs here.
 *
 * Dates are relative to `now` because the builders window activities against
 * `Date.now()`; a frozen date would fall out of every window and describe
 * nothing.
 *
 * Field coverage is deliberate: rides carry power/kilojoules and no
 * `workout_type`, runs carry `workout_type` and no power. The union across
 * records is the contract an agent can encounter, which is exactly what the
 * demo has to show.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDaysAgo = (now, days) => new Date(now - days * DAY_MS).toISOString();

const GPS_FIELDS = {
  // Present on purpose: the gate proves these never reach the agent.
  start_latlng: [0, 0],
  end_latlng: [0, 0],
  location_city: null,
  location_state: null,
  location_country: "Synthetica",
  map: { id: "aSYNTHETIC", summary_polyline: "??_ibE_ibE", resource_state: 2 }
};

/** Three activities inside the current 7-day window plus one older comparison week. */
export function syntheticActivities(now = Date.now()) {
  return [
    {
      resource_state: 2,
      athlete: { id: 99000001, resource_state: 1 },
      name: "Sunrise base ride",
      distance: 32410.5,
      moving_time: 4320,
      elapsed_time: 4515,
      total_elevation_gain: 214,
      type: "Ride",
      sport_type: "Ride",
      id: 99100000001,
      start_date: isoDaysAgo(now, 1),
      start_date_local: isoDaysAgo(now, 1),
      timezone: "(GMT-03:00) America/Fortaleza",
      utc_offset: -10800,
      achievement_count: 1,
      kudos_count: 6,
      comment_count: 0,
      athlete_count: 2,
      photo_count: 0,
      trainer: false,
      commute: false,
      manual: false,
      private: false,
      visibility: "everyone",
      flagged: false,
      gear_id: "b99000456",
      average_speed: 7.5,
      max_speed: 12.9,
      average_cadence: 82.4,
      average_watts: 148.2,
      weighted_average_watts: 163,
      kilojoules: 640.1,
      device_watts: true,
      has_heartrate: true,
      average_heartrate: 131.4,
      max_heartrate: 158,
      heartrate_opt_out: false,
      display_hide_heartrate_option: true,
      elev_high: 88.3,
      elev_low: 4.2,
      upload_id: 99200000001,
      upload_id_str: "99200000001",
      external_id: "synthetic-ride-1.fit",
      from_accepted_tag: false,
      pr_count: 0,
      total_photo_count: 0,
      has_kudoed: false,
      suffer_score: 64,
      calories: 612,
      device_name: "Synthetic Bike Computer B1",
      ...GPS_FIELDS
    },
    {
      resource_state: 2,
      athlete: { id: 99000001, resource_state: 1 },
      name: "Tempo intervals",
      distance: 8024.9,
      moving_time: 2640,
      elapsed_time: 2810,
      total_elevation_gain: 58,
      type: "Run",
      sport_type: "Run",
      workout_type: 3,
      id: 99100000002,
      start_date: isoDaysAgo(now, 2),
      start_date_local: isoDaysAgo(now, 2),
      timezone: "(GMT-03:00) America/Fortaleza",
      utc_offset: -10800,
      achievement_count: 3,
      kudos_count: 9,
      comment_count: 1,
      athlete_count: 1,
      photo_count: 0,
      trainer: false,
      commute: false,
      manual: false,
      private: false,
      visibility: "everyone",
      flagged: false,
      gear_id: "g99000123",
      average_speed: 3.04,
      max_speed: 4.62,
      average_cadence: 87.5,
      has_heartrate: true,
      average_heartrate: 165.1,
      max_heartrate: 181,
      heartrate_opt_out: false,
      display_hide_heartrate_option: true,
      elev_high: 41,
      elev_low: 5.4,
      upload_id: 99200000002,
      upload_id_str: "99200000002",
      external_id: "synthetic-run-1.fit",
      from_accepted_tag: false,
      pr_count: 1,
      total_photo_count: 0,
      has_kudoed: false,
      suffer_score: 78,
      calories: 602,
      device_name: "Synthetic Watch S1",
      ...GPS_FIELDS
    },
    {
      resource_state: 2,
      athlete: { id: 99000001, resource_state: 1 },
      name: "Easy shakeout",
      distance: 5012.4,
      moving_time: 1680,
      elapsed_time: 1742,
      total_elevation_gain: 42,
      type: "Run",
      sport_type: "Run",
      workout_type: 0,
      id: 99100000003,
      start_date: isoDaysAgo(now, 3),
      start_date_local: isoDaysAgo(now, 3),
      timezone: "(GMT-03:00) America/Fortaleza",
      utc_offset: -10800,
      achievement_count: 0,
      kudos_count: 4,
      comment_count: 0,
      athlete_count: 1,
      photo_count: 0,
      trainer: false,
      commute: false,
      manual: false,
      private: false,
      visibility: "everyone",
      flagged: false,
      gear_id: "g99000123",
      average_speed: 2.98,
      max_speed: 4.11,
      average_cadence: 84.2,
      has_heartrate: true,
      average_heartrate: 142.3,
      max_heartrate: 168,
      heartrate_opt_out: false,
      display_hide_heartrate_option: true,
      elev_high: 38.2,
      elev_low: 6.1,
      upload_id: 99200000003,
      upload_id_str: "99200000003",
      external_id: "synthetic-run-2.fit",
      from_accepted_tag: false,
      pr_count: 0,
      total_photo_count: 0,
      has_kudoed: false,
      suffer_score: 32,
      calories: 341,
      device_name: "Synthetic Watch S1",
      ...GPS_FIELDS
    },
    {
      resource_state: 2,
      athlete: { id: 99000001, resource_state: 1 },
      name: "Previous week long ride",
      distance: 42100,
      moving_time: 6300,
      elapsed_time: 6720,
      total_elevation_gain: 380,
      type: "Ride",
      sport_type: "Ride",
      id: 99100000004,
      start_date: isoDaysAgo(now, 10),
      start_date_local: isoDaysAgo(now, 10),
      timezone: "(GMT-03:00) America/Fortaleza",
      utc_offset: -10800,
      achievement_count: 2,
      kudos_count: 7,
      comment_count: 0,
      athlete_count: 3,
      photo_count: 0,
      trainer: false,
      commute: false,
      manual: false,
      private: false,
      visibility: "everyone",
      flagged: false,
      gear_id: "b99000456",
      average_speed: 6.68,
      max_speed: 13.4,
      average_cadence: 79.8,
      average_watts: 152.6,
      weighted_average_watts: 171,
      kilojoules: 961.4,
      device_watts: true,
      has_heartrate: true,
      average_heartrate: 138.7,
      max_heartrate: 172,
      heartrate_opt_out: false,
      display_hide_heartrate_option: true,
      elev_high: 155.9,
      elev_low: 3.2,
      upload_id: 99200000004,
      upload_id_str: "99200000004",
      external_id: "synthetic-ride-2.fit",
      from_accepted_tag: false,
      pr_count: 0,
      total_photo_count: 0,
      has_kudoed: false,
      suffer_score: 121,
      calories: 998,
      device_name: "Synthetic Bike Computer B1",
      ...GPS_FIELDS
    }
  ];
}

/**
 * Stand-in for `StravaClient.list`. The summary/context builders only need
 * `list`; the collection envelope also reads `next_page` / `pages_fetched`.
 */
export function syntheticClient(now = Date.now()) {
  const records = syntheticActivities(now);
  return {
    async list() {
      return { records, pages_fetched: 1, next_page: 2 };
    }
  };
}
