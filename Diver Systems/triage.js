const {
  SAFE_ASCENT_RATE_MPS,
  RAPID_ASCENT_THRESHOLD_MPS,
  MODERATE_N2_THRESHOLD,
  HIGH_N2_THRESHOLD,
  NARCOSIS_DEPTH_THRESHOLD_M,
  AIR_SUPPLY_WARNING_PCT,
  AIR_SUPPLY_CRITICAL_PCT,
} = require('./constants');
const { getNoDecompressionLimitMinutes, NDL_APPROACHING_FRACTION } = require('./decompression');

/**
 * @param {object} context
 * @param {number} context.ascent_rate        m/s, positive = ascending
 * @param {number} context.n2_saturation_est  0-1 scale
 * @param {number} context.depth_m            meters, positive
 * @param {number} context.air_supply_pct     0-100
 * @param {number} [context.dive_time_elapsed] seconds since dive start — used against the real NDL table (Day 16); omit to skip this check
 * @returns {{ tier: 'green'|'yellow'|'red', reasons: string[] }}
 */
function evaluateTriage({ ascent_rate, n2_saturation_est, depth_m, air_supply_pct, dive_time_elapsed }) {
  const redReasons = [];
  const yellowReasons = [];
  if (ascent_rate >= RAPID_ASCENT_THRESHOLD_MPS && n2_saturation_est >= HIGH_N2_THRESHOLD) {
    redReasons.push('rapid_ascent_high_n2_dcs_risk');
  }
  if (air_supply_pct <= AIR_SUPPLY_CRITICAL_PCT) {
    redReasons.push('air_supply_critical');
  }
  let ndlFraction = null;
  if (typeof dive_time_elapsed === 'number' && depth_m > 0) {
    const ndlMinutes = getNoDecompressionLimitMinutes(depth_m);
    ndlFraction = (dive_time_elapsed / 60) / ndlMinutes;
    if (ndlFraction >= 1) {
      redReasons.push('ndl_exceeded');
    }
  }
  if (ascent_rate > SAFE_ASCENT_RATE_MPS) {
    yellowReasons.push('ascent_rate_above_safe_guideline');
  }
  if (n2_saturation_est > MODERATE_N2_THRESHOLD) {
    yellowReasons.push('n2_saturation_elevated');
  }
  if (depth_m >= NARCOSIS_DEPTH_THRESHOLD_M) {
    yellowReasons.push('narcosis_depth_threshold');
  }

  if (air_supply_pct <= AIR_SUPPLY_WARNING_PCT && air_supply_pct > AIR_SUPPLY_CRITICAL_PCT) {
    yellowReasons.push('air_supply_low');
  }

  if (ndlFraction !== null && ndlFraction >= NDL_APPROACHING_FRACTION && ndlFraction < 1) {
    yellowReasons.push('approaching_ndl');
  }

  let tier = 'green';
  if (redReasons.length > 0) tier = 'red';
  else if (yellowReasons.length > 0) tier = 'yellow';

  return { tier, reasons: [...redReasons, ...yellowReasons] };
}
function computeTriageTier(context) {
  return evaluateTriage(context).tier;
}

module.exports = { computeTriageTier, evaluateTriage };
