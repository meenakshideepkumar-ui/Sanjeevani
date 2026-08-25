const { DiveProfileSimulator, PHASES } = require('./simulator');
const { DiverFleet } = require('./fleet');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}
section('1. Simultaneous DCS events across a fleet stay isolated per-diver');
{
  const fleet = new DiverFleet({ size: 5, bottomTimeRange: [30, 30] });
  for (let i = 0; i < 20 && !Array.from(fleet.divers.values()).every((d) => d.phase !== PHASES.DESCEND && d.phase !== PHASES.BOTTOM); i++) {
    fleet.step(10);
  }

  const ids = Array.from(fleet.divers.keys());
  const spikedIds = [ids[0], ids[2]]; // spike two of the five
  spikedIds.forEach((id) => fleet.get(id).triggerRapidAscent(5, 30));
  let packets = [];
  const allSpikedPackets = [];
  for (let i = 0; i < 10 && !fleet.isFinished(); i++) {
    packets = fleet.step(5);
    allSpikedPackets.push(...packets.filter((p) => spikedIds.includes(p.worker_id)));
  }

  const spikedPackets = allSpikedPackets;
  const calmPackets = packets.filter((p) => !spikedIds.includes(p.worker_id));

  check(
    'spiked divers show elevated ascent_rate at some point during the spike window',
    spikedPackets.some((p) => p.ascent_rate > 0.3),
    JSON.stringify(spikedPackets.map((p) => p.ascent_rate))
  );
  check(
    'non-spiked divers are unaffected by their fleet-mates\' spikes',
    calmPackets.every((p) => !p._dcs_risk_flag),
    JSON.stringify(calmPackets.map((p) => ({ id: p.worker_id, flag: p._dcs_risk_flag })))
  );
}
section('2. False-positive check: normal dive stays green start to finish');
{
  const sim = new DiveProfileSimulator({ workerId: 'FP1', targetDepth: 18, bottomTimeSec: 900, ascentRate: 0.2 });
  const tiers = new Set();
  const reasonsSeen = new Set();
  for (let i = 0; i < 2000 && !sim.isFinished(); i++) {
    const p = sim.step(5);
    tiers.add(p.triage_tier);
    p._triage_reasons.forEach((r) => reasonsSeen.add(r));
  }
  check('only "green" ever appears', tiers.size === 1 && tiers.has('green'), `saw tiers: ${[...tiers]}`);
  check('no triage reasons ever fire', reasonsSeen.size === 0, `saw reasons: ${[...reasonsSeen]}`);
}

section('3. False-positive check: shallow dive (12m) never trips narcosis');
{
  const sim = new DiveProfileSimulator({ workerId: 'FP2', targetDepth: 12, bottomTimeSec: 600 });
  let narcosisEverFlagged = false;
  for (let i = 0; i < 500 && !sim.isFinished(); i++) {
    const p = sim.step(5);
    if (p._narcosis_risk_flag) narcosisEverFlagged = true;
  }
  check('narcosis flag never fires at 12m', !narcosisEverFlagged);
}

section('4. Combined edge conditions on a single diver (distress + dropout + spike)');
{
  const sim = new DiveProfileSimulator({ workerId: 'D_COMBO', targetDepth: 20, bottomTimeSec: 60, enableSafetyStop: false });
  for (let i = 0; i < 20 && sim.phase !== PHASES.ASCEND; i++) sim.step(5);

  sim.triggerRapidAscent(4, 30);
  sim.triggerDistress();
  sim.triggerSignalDropout({ degradeSec: 3, lostSec: 8 });

  let sawRedWhileDegraded = false;
  let emittedWhileLost = 0;
  let totalEmitted = 0;
  sim.on('packet', () => { emittedWhileLost += sim.dropoutState === 'lost' ? 1 : 0; totalEmitted++; });

  for (let i = 0; i < 15 && !sim.isFinished(); i++) {
    const p = sim.step(1);
    if (p.comms_status === 'degraded' && p.triage_tier === 'red') sawRedWhileDegraded = true;
  }

  check('distress forces red even while other events are active', sawRedWhileDegraded);
  check('no packet event fires while comms are lost, even mid-emergency', emittedWhileLost === 0, `emitted ${emittedWhileLost} during lost state`);
  check('packets DO still emit while only degraded (not fully lost)', totalEmitted > 0);
}

section('5. False-positive check: air supply just above the warning line stays green');
{
  const { evaluateTriage } = require('./triage');
  const result = evaluateTriage({ ascent_rate: 0.1, n2_saturation_est: 0.2, depth_m: 10, air_supply_pct: 26, dive_time_elapsed: 300 });
  check('26% air (1pt above 25% warning line) does not trigger a warning', result.tier === 'green', JSON.stringify(result));
}
section('6. Exact-threshold boundary checks');
{
  const { evaluateTriage } = require('./triage');
  const { SAFE_ASCENT_RATE_MPS, RAPID_ASCENT_THRESHOLD_MPS, AIR_SUPPLY_WARNING_PCT, AIR_SUPPLY_CRITICAL_PCT } = require('./constants');

  const atSafe = evaluateTriage({ ascent_rate: SAFE_ASCENT_RATE_MPS, n2_saturation_est: 0.2, depth_m: 10, air_supply_pct: 100, dive_time_elapsed: 300 });
  check('ascent_rate exactly AT the safe guideline is still green (only "above" trips it)', atSafe.tier === 'green', JSON.stringify(atSafe));

  const atWarning = evaluateTriage({ ascent_rate: 0.1, n2_saturation_est: 0.2, depth_m: 10, air_supply_pct: AIR_SUPPLY_WARNING_PCT, dive_time_elapsed: 300 });
  check('air supply exactly at the 25% warning line IS flagged (<=)', atWarning.tier === 'yellow', JSON.stringify(atWarning));

  const atCritical = evaluateTriage({ ascent_rate: 0.1, n2_saturation_est: 0.2, depth_m: 10, air_supply_pct: AIR_SUPPLY_CRITICAL_PCT, dive_time_elapsed: 300 });
  check('air supply exactly at the 10% critical line escalates to red', atCritical.tier === 'red', JSON.stringify(atCritical));
}

section('7. Multiple simultaneous manual distress signals across a fleet');
{
  const fleet = new DiverFleet({ size: 4, bottomTimeRange: [20, 20] });
  const ids = Array.from(fleet.divers.keys());
  fleet.get(ids[0]).triggerDistress();
  fleet.get(ids[3]).triggerDistress();

  const packets = fleet.step(1);
  const distressed = packets.filter((p) => [ids[0], ids[3]].includes(p.worker_id));
  const calm = packets.filter((p) => ![ids[0], ids[3]].includes(p.worker_id));

  check('both distressed divers show red', distressed.every((p) => p.triage_tier === 'red'));
  check('non-distressed divers unaffected', calm.every((p) => p.triage_tier !== 'red'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
