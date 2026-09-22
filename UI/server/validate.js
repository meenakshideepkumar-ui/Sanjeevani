// Integration & Safety — protocol validation.
// Implements the "fail loud" rule from protocol.md §5: reject a packet that is
// missing common fields, has a bad domain, or carries the WRONG domain block
// (e.g. a diver packet with co_ppm). Returns { ok, errors }.

const COMMON = ['worker_id', 'domain', 'ts', 'hr', 'spo2', 'motion_g',
  'pos_x', 'pos_y', 'pos_z', 'triage_tier', 'battery_pct', 'comms_status'];
const DIVER = ['depth_m', 'ascent_rate', 'dive_time_elapsed', 'n2_saturation_est', 'air_supply_pct'];
const MINER = ['co_ppm', 'ch4_pct', 'o2_pct', 'ambient_temp_c', 'seismic_reading', 'self_rescuer_status'];
const TIERS = ['green', 'yellow', 'red'];
const COMMS = ['ok', 'degraded', 'lost'];

function validatePacket(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return { ok: false, errors: ['packet is not an object'] };

  for (const f of COMMON) if (!(f in p)) errors.push(`missing common field: ${f}`);
  if (p.domain !== 'diver' && p.domain !== 'miner') {
    errors.push(`domain must be "diver" or "miner" (got ${JSON.stringify(p.domain)})`);
  }
  if ('triage_tier' in p && !TIERS.includes(p.triage_tier)) errors.push(`triage_tier invalid: ${p.triage_tier}`);
  if ('comms_status' in p && !COMMS.includes(p.comms_status)) errors.push(`comms_status invalid: ${p.comms_status}`);

  if (p.domain === 'diver') {
    for (const f of DIVER) if (!(f in p)) errors.push(`diver packet missing block field: ${f}`);
    for (const f of MINER) if (f in p) errors.push(`diver packet carries a stray miner field: ${f}`);
  } else if (p.domain === 'miner') {
    for (const f of MINER) if (!(f in p)) errors.push(`miner packet missing block field: ${f}`);
    for (const f of DIVER) if (f in p) errors.push(`miner packet carries a stray diver field: ${f}`);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validatePacket, COMMON, DIVER, MINER };
