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
  bottomTimeSec: args.bottom ?? 90, 
  ascentRate: args.ascentRate ?? 0.3,
});

const simSecondsPerTick = args.speed ?? 10; 
const tickMs = 250; 
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
