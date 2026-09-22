// Integration & Safety — configuration (env-overridable).
module.exports = {
  PORT: Number(process.env.PORT || 5000),

  // Auth: if API_TOKEN is set, telemetry INGEST requires it (producers).
  // Dashboard VIEWERS connect freely unless REQUIRE_VIEWER_AUTH=1.
  API_TOKEN: process.env.API_TOKEN || null,
  REQUIRE_VIEWER_AUTH: process.env.REQUIRE_VIEWER_AUTH === '1',

  // Offline handling: how long without a packet before a worker is degraded / lost.
  DEGRADED_TIMEOUT_MS: Number(process.env.DEGRADED_TIMEOUT_MS || 6000),
  OFFLINE_TIMEOUT_MS: Number(process.env.OFFLINE_TIMEOUT_MS || 12000),
  WATCHDOG_INTERVAL_MS: Number(process.env.WATCHDOG_INTERVAL_MS || 2000),

  DEMO: process.env.DEMO === '1',

  // The event name the dashboard already listens for — do not change lightly.
  TELEMETRY_EVENT: 'telemetry_update',
};
