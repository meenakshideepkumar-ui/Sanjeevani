/**
 * triage.js
 * Diver Systems — triage tier logic
 *
 * Day 8  — Green/Yellow: normal depth/ascent vs. mild deviation.
 * Day 9  — Red: rapid ascent + high N2 saturation together = DCS risk trigger.
 * Day 10 — feeds in: nitrogen-narcosis depth threshold (cognitive-risk indicator).
 * Day 11 — feeds in: low-air-supply warning / critical thresholds.
 *
 * Pure function of a diver's current field values — no dependency on
 * Integration's server or Dashboard's UI, so this doesn't need the Day 7
 * sync to be useful; it only reads packet fields the simulator already
 * produces.
 *
 * NOTE (protocol.md open question, §5): whether `triage_tier` is computed
 * client-side (here) or server-side by Integration is still open. This
 * module computes it client-side so the diver simulator always emits a
 * fully-populated packet; if the team decides Integration should own it
 * instead, this module can be moved/reused there unchanged — it doesn't
 * touch anything else in the simulator.
 */

const {
  SAFE_ASCENT_RATE_MPS,
  RAPID_ASCENT_THRESHOLD_MPS,
  MODERATE_N2_THRESHOLD,
  HIGH_N2_THRESHOLD,
  NARCOSIS_DEPTH_THRESHOLD_M,
  AIR_SUPPLY_WARNING_PCT,
  AIR_SUPPLY_CRITICAL_PCT,
} = require('./constants');

/**
 * @param {object} context
 * @param {number} context.ascent_rate       m/s, positive = ascending
 * @param {number} context.n2_saturation_est 0-1 scale
 * @param {number} context.depth_m           meters, positive
 * @param {number} context.air_supply_pct    0-100
 * @returns {{ tier: 'green'|'yellow'|'red', reasons: string[] }}
 */
function evaluateTriage({ ascent_rate, n2_saturation_est, depth_m, air_supply_pct }) {
  const redReasons = [];
  const yellowReasons = [];

  // --- Red-tier checks (Day 9, Day 11) ---

  // Day 9: rapid ascent AND high N2 together = DCS risk. Both conditions
  // required — neither signal alone is treated as an emergency here.
  if (ascent_rate >= RAPID_ASCENT_THRESHOLD_MPS && n2_saturation_est >= HIGH_N2_THRESHOLD) {
    redReasons.push('rapid_ascent_high_n2_dcs_risk');
  }

  // Day 11: air supply has run critically low.
  if (air_supply_pct <= AIR_SUPPLY_CRITICAL_PCT) {
    redReasons.push('air_supply_critical');
  }

  // --- Yellow-tier checks (Day 8, Day 10, Day 11) ---
  // No upper bound on these: Red is only reached when rapid ascent AND
  // high N2 occur *together*. Either one alone — even if it individually
  // exceeds the "rapid"/"high" threshold — still needs to surface as at
  // least Yellow, not fall through to green just because it missed the
  // narrower Red combination.

  // Day 8: ascent faster than the safe guideline.
  if (ascent_rate > SAFE_ASCENT_RATE_MPS) {
    yellowReasons.push('ascent_rate_above_safe_guideline');
  }

  // Day 8: N2 saturation moderately elevated (or higher, if it got here
  // without a rapid ascent to pair with it for Red).
  if (n2_saturation_est > MODERATE_N2_THRESHOLD) {
    yellowReasons.push('n2_saturation_elevated');
  }

  // Day 10: past the depth where nitrogen narcosis becomes a cognitive-risk
  // concern, regardless of ascent/N2 behavior.
  if (depth_m >= NARCOSIS_DEPTH_THRESHOLD_M) {
    yellowReasons.push('narcosis_depth_threshold');
  }

  // Day 11: air supply low but not yet critical.
  if (air_supply_pct <= AIR_SUPPLY_WARNING_PCT && air_supply_pct > AIR_SUPPLY_CRITICAL_PCT) {
    yellowReasons.push('air_supply_low');
  }

  let tier = 'green';
  if (redReasons.length > 0) tier = 'red';
  else if (yellowReasons.length > 0) tier = 'yellow';

  return { tier, reasons: [...redReasons, ...yellowReasons] };
}

/** Convenience wrapper when only the tier string is needed. */
function computeTriageTier(context) {
  return evaluateTriage(context).tier;
}

module.exports = { computeTriageTier, evaluateTriage };
