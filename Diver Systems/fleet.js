const EventEmitter = require('events');
const { DiveProfileSimulator } = require('./simulator');

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

class DiverFleet extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.size            number of divers to spin up (default 5 — realistic 4-6 crew per Day 18)
   * @param {string} opts.idPrefix        worker_id prefix, per protocol.md convention (default "D")
   * @param {[number, number]} opts.depthRange   [min, max] target depth in meters
   * @param {[number, number]} opts.bottomTimeRange  [min, max] bottom time in seconds
   * @param {number} opts.autoRapidAscentChance  passed through to each diver (Day 6)
   * @param {number} opts.autoDropoutChance      passed through to each diver (Day 15)
   * @param {boolean} opts.enableSafetyStop      passed through to each diver (Day 17)
   */
  constructor({
    size = 5,
    idPrefix = 'D',
    depthRange = [12, 28],
    bottomTimeRange = [600, 1200],
    autoRapidAscentChance = 0,
    autoDropoutChance = 0,
    enableSafetyStop = true,
  } = {}) {
    super();

    this.divers = new Map(); // worker_id -> DiveProfileSimulator

    for (let i = 1; i <= size; i++) {
      const workerId = `${idPrefix}${String(i).padStart(2, '0')}`;
      const sim = new DiveProfileSimulator({
        workerId,
        targetDepth: Number(randomBetween(depthRange[0], depthRange[1]).toFixed(1)),
        descentRate: Number(randomBetween(0.35, 0.55).toFixed(2)),
        bottomTimeSec: Math.round(randomBetween(bottomTimeRange[0], bottomTimeRange[1])),
        ascentRate: Number(randomBetween(0.18, 0.28).toFixed(2)),
        autoRapidAscentChance,
        autoDropoutChance,
        enableSafetyStop,
      });
      sim.on('packet', (packet) => this.emit('packet', packet));
      sim.on('signal_lost', (info) => this.emit('signal_lost', info));
      sim.on('signal_degraded', (info) => this.emit('signal_degraded', info));
      sim.on('signal_recovered', (info) => this.emit('signal_recovered', info));

      this.divers.set(workerId, sim);
    }
  }
  step(dt) {
    const packets = [];
    for (const sim of this.divers.values()) {
      packets.push(sim.step(dt));
    }
    this.emit('tick', packets);
    return packets;
  }
  isFinished() {
    for (const sim of this.divers.values()) {
      if (!sim.isFinished()) return false;
    }
    return true;
  }

  get(workerId) {
    return this.divers.get(workerId);
  }

  getPackets() {
    return Array.from(this.divers.values()).map((sim) => sim.getPacket());
  }
}

module.exports = { DiverFleet };
