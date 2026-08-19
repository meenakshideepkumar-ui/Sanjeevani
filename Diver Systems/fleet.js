/**
 * fleet.js
 * Day 4 — Diver Systems
 * Add multi-diver support; simulate normal dive cycle (descend/bottom/ascend)
 * across a whole team of divers at once.
 *
 * Each diver in the fleet is an independent DiveProfileSimulator with its
 * own (optionally randomized) profile — different target depth, descent
 * rate, bottom time — so a fleet doesn't look like N clones of one diver.
 * Every diver still carries the Day 5 N2 model and Day 6 rapid-ascent
 * capability, since those live on DiveProfileSimulator itself.
 */

const EventEmitter = require('events');
const { DiveProfileSimulator } = require('./simulator');

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

class DiverFleet extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.size            number of divers to spin up (default 4)
   * @param {string} opts.idPrefix        worker_id prefix, per protocol.md convention (default "D")
   * @param {[number, number]} opts.depthRange   [min, max] target depth in meters
   * @param {[number, number]} opts.bottomTimeRange  [min, max] bottom time in seconds
   * @param {number} opts.autoRapidAscentChance  passed through to each diver (Day 6)
   */
  constructor({
    size = 4,
    idPrefix = 'D',
    depthRange = [12, 28],
    bottomTimeRange = [600, 1200],
    autoRapidAscentChance = 0,
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
      });

      sim.on('packet', (packet) => {
        // Re-emit individually so downstream code can subscribe once to
        // the fleet instead of wiring each diver.
        this.emit('packet', packet);
      });

      this.divers.set(workerId, sim);
    }
  }

  /** Advance every diver by dt seconds. Returns the array of packets produced this tick. */
  step(dt) {
    const packets = [];
    for (const sim of this.divers.values()) {
      packets.push(sim.step(dt));
    }
    this.emit('tick', packets);
    return packets;
  }

  /** True once every diver in the fleet has surfaced. */
  isFinished() {
    for (const sim of this.divers.values()) {
      if (!sim.isFinished()) return false;
    }
    return true;
  }

  /** Look up one diver's simulator by worker_id, e.g. for manually triggering events on it. */
  get(workerId) {
    return this.divers.get(workerId);
  }

  /** Snapshot packets for every diver without advancing time. */
  getPackets() {
    return Array.from(this.divers.values()).map((sim) => sim.getPacket());
  }
}

module.exports = { DiverFleet };
