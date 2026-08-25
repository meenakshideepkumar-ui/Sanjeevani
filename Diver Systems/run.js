const { DiveProfileSimulator } = require('./simulator');
+const { DiverFleet } = require('./fleet');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === '--spike' || arg === '--distress' || arg === '--dropout' || arg === '--noSafetyStop') {
      args[arg.slice(2)] = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
      const key = match[1];
      const val = match[2];
      args[key] = Number.isNaN(Number(val)) ? val : Number(val);
    }
  }
  return args;
}

const args = parseArgs();
const simSecondsPerTick = args.speed ?? 10;
const tickMs = 250;
const enableSafetyStop = !args.noSafetyStop;

function wireOneShotEvents(target, onDone) {
  let spiked = false;
  let distressed = false;
  let dropped = false;

  return function afterStep() {
    if (args.spike && !spiked && target.phase === 'ascend') {
      target.triggerRapidAscent();
      spiked = true;
      console.error(`\n[spike] forced rapid ascent on ${target.workerId}\n`);
    }
    if (args.distress && !distressed) {
      target.triggerDistress();
      distressed = true;
      console.error(`\n[distress] manual distress signal triggered on ${target.workerId}\n`);
    }
    if (args.dropout && !dropped) {
      const mode = args.dropoutMode === 'degraded' ? 'degraded' : 'lost';
      if (mode === 'degraded') {
        target.triggerSignalDropout({ degradeSec: 30, lostSec: 0 });
      } else {
        target.triggerSignalDropout({ lostSec: 30 });
      }
      dropped = true;
      console.error(`\n[dropout] signal ${mode} on ${target.workerId}\n`);
    }
  };
}

if (args.fleet) {
  const fleet = new DiverFleet({
    size: args.fleet,
    bottomTimeRange: [args.bottom ?? 60, (args.bottom ?? 60) + 60],
    autoRapidAscentChance: args.autoSpikeChance ?? 0,
    autoDropoutChance: args.autoDropoutChance ?? 0,
    enableSafetyStop,
  });

  fleet.on('packet', (packet) => console.log(JSON.stringify(packet)));
  fleet.on('signal_lost', ({ workerId }) => console.error(`[signal] ${workerId} LOST`));
  fleet.on('signal_recovered', ({ workerId }) => console.error(`[signal] ${workerId} recovered`));

  let targetPicked = null;
  let afterStep = null;

  const interval = setInterval(() => {
    fleet.step(simSecondsPerTick);

    if (!targetPicked && (args.spike || args.distress || args.dropout)) {
      const ids = Array.from(fleet.divers.keys());
      targetPicked = fleet.get(ids[Math.floor(Math.random() * ids.length)]);
      afterStep = wireOneShotEvents(targetPicked);
    }
    if (afterStep) afterStep();

    if (fleet.isFinished()) {
      clearInterval(interval);
      console.error('\n[done] all divers surfaced.');
    }
  }, tickMs);
} else {
  const sim = new DiveProfileSimulator({
    workerId: 'D01',
    targetDepth: args.depth ?? 18,
    descentRate: args.descentRate ?? 0.5,
    bottomTimeSec: args.bottom ?? 90,
    ascentRate: args.ascentRate ?? 0.25,
    n2HalfTimeSec: args.n2HalfTime ?? 900,
    autoRapidAscentChance: args.autoSpikeChance ?? 0,
    autoDropoutChance: args.autoDropoutChance ?? 0,
    enableSafetyStop,
  });

  sim.on('packet', (packet) => console.log(JSON.stringify(packet)));
  sim.on('signal_lost', ({ workerId }) => console.error(`[signal] ${workerId} LOST`));
  sim.on('signal_recovered', ({ workerId }) => console.error(`[signal] ${workerId} recovered`));

  const afterStep = wireOneShotEvents(sim);

  const interval = setInterval(() => {
    sim.step(simSecondsPerTick);
    afterStep();

    if (sim.isFinished()) {
      clearInterval(interval);
      console.error(`\n[done] dive complete. total dive_time_elapsed=${sim.getPacket().dive_time_elapsed}s`);
    }
  }, tickMs);
}
