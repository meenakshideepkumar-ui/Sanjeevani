/**
 * run.js
 * Standalone runner for DiveProfileSimulator.
 *
 * Streams one JSON packet per line to stdout, matching shared/protocol.md.
 * Useful for:
 *   - Eyeballing the packet shape/values right now
 *   - Piping into Integration & Safety's WebSocket server later
 *     (e.g. `node run.js | some-forwarder`), or importing
 *     DiveProfileSimulator directly once Day 4+ multi-diver support lands.
 *
 * Usage:
 *   node run.js
 *   node run.js --speed=20      # simulate 20s of dive time per tick (faster)
 *   node run.js --depth=25 --bottom=600
 */

const { DiveProfileSimulator } = require('./simulator');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) args[match[1]] = Number(match[2]);
  }
  return args;
}

const args = parseArgs();

const sim = new DiveProfileSimulator({
  workerId: 'D01',
  targetDepth: args.depth ?? 18,
  descentRate: args.descentRate ?? 0.5,
  bottomTimeSec: args.bottom ?? 90, // shortened default so a demo run finishes quickly
  ascentRate: args.ascentRate ?? 0.3,
});

const simSecondsPerTick = args.speed ?? 10; // sim-seconds advanced per real tick
const tickMs = 250; // real ms between ticks

sim.on('packet', (packet) => {
  console.log(JSON.stringify(packet));
});

const interval = setInterval(() => {
  sim.step(simSecondsPerTick);
  if (sim.isFinished()) {
    clearInterval(interval);
    console.error(`\n[done] dive complete. total dive_time_elapsed=${sim.getPacket().dive_time_elapsed}s`);
  }
}, tickMs);
