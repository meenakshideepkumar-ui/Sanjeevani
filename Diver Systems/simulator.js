/**
 * simulator.js
 * Day 3 — Diver Systems
 * Build dive-profile simulator: depth, ascent rate, dive time for 1 diver.
 *
 * Models a single diver moving through a realistic dive profile:
 *   descend -> bottom time -> ascend -> surfaced
 *
 * Emits packets shaped exactly per shared/protocol.md (common fields +
 * diver-only block), one per `step()` call, via EventEmitter('packet').
 *
 * Fields intentionally stubbed for later days (left as clearly-marked
 * placeholders so the packet shape is correct from Day 3 onward):
 *   - pos_x / pos_y      -> Day 10 (acoustic beacon positioning sim)
 *   - triage_tier        -> Day 8-9 (triage engine)
 *   - n2_saturation_est  -> Day 5 (N2 saturation build-up model)
 *   - air_supply_pct     -> simple linear drain for now, refine Day 11
 */

const EventEmitter = require('events');

const PHASES = {
  DESCEND: 'descend',
  BOTTOM: 'bottom',
  ASCEND: 'ascend',
  SURFACED: 'surfaced',
};

class DiveProfileSimulator extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.workerId      e.g. "D01"
   * @param {number} opts.targetDepth   meters, positive (e.g. 18)
   * @param {number} opts.descentRate   m/s during descent (e.g. 0.5)
   * @param {number} opts.bottomTimeSec seconds spent at target depth
   * @param {number} opts.ascentRate    m/s during ascent (e.g. 0.3 — safe guideline ~10m/min)
   */
  constructor({
    workerId = 'D01',
    targetDepth = 18,
    descentRate = 0.5,
    bottomTimeSec = 900,
    ascentRate = 0.3,
  } = {}) {
    super();
    this.workerId = workerId;
    this.domain = 'diver';

    this.targetDepth = targetDepth;
    this.descentRate = descentRate;
    this.bottomTimeSec = bottomTimeSec;
    this.ascentRate = ascentRate;

    this.depth = 0;
    this.phase = PHASES.DESCEND;
    this.elapsed = 0;
    this.bottomElapsed = 0;
    this.lastAscentRate = 0;

    // Simple placeholder drains — not the focus of Day 3, kept so the
    // packet has plausible values. Revisit when their dedicated days land.
    this.airSupplyPct = 100;
    this.batteryPct = 100;
  }

  /**
   * Advance the simulation by dt seconds and emit + return the next packet.
   * @param {number} dt seconds of simulated dive time to advance
   */
  step(dt) {
    this.elapsed += dt;
    let depthDelta = 0;

    switch (this.phase) {
      case PHASES.DESCEND: {
        depthDelta = this.descentRate * dt;
        this.depth = Math.min(this.targetDepth, this.depth + depthDelta);
        if (this.depth >= this.targetDepth) this.phase = PHASES.BOTTOM;
        break;
      }
      case PHASES.BOTTOM: {
        this.bottomElapsed += dt;
        depthDelta = 0;
        if (this.bottomElapsed >= this.bottomTimeSec) this.phase = PHASES.ASCEND;
        break;
      }
      case PHASES.ASCEND: {
        depthDelta = -this.ascentRate * dt;
        this.depth = Math.max(0, this.depth + depthDelta);
        if (this.depth <= 0) this.phase = PHASES.SURFACED;
        break;
      }
      case PHASES.SURFACED: {
        depthDelta = 0;
        break;
      }
      default:
        break;
    }

    // ascent_rate per protocol: m/s, positive = ascending.
    this.lastAscentRate = dt > 0 ? -(depthDelta / dt) : 0;

    // Placeholder resource drains.
    this.airSupplyPct = Math.max(0, this.airSupplyPct - dt * 0.01);
    this.batteryPct = Math.max(0, this.batteryPct - dt * 0.001);

    const packet = this.getPacket();
    this.emit('packet', packet);
    return packet;
  }

  /** Build the current packet, matching shared/protocol.md exactly. */
  getPacket() {
    return {
      // --- common fields ---
      worker_id: this.workerId,
      domain: this.domain,
      ts: Math.floor(Date.now() / 1000),
      hr: this._simHr(),
      spo2: this._simSpo2(),
      motion_g: this._simMotion(),
      pos_x: 0, // placeholder — Day 10 positioning sim
      pos_y: 0, // placeholder — Day 10 positioning sim
      pos_z: -Number(this.depth.toFixed(2)), // negative = below surface
      triage_tier: 'green', // placeholder — Day 8-9 triage engine
      battery_pct: Math.round(this.batteryPct),
      comms_status: 'ok',

      // --- diver-only block ---
      depth_m: Number(this.depth.toFixed(2)),
      ascent_rate: Number(this.lastAscentRate.toFixed(3)),
      dive_time_elapsed: Math.floor(this.elapsed),
      n2_saturation_est: 0, // placeholder — Day 5 model
      air_supply_pct: Math.round(this.airSupplyPct),
    };
  }

  _simHr() {
    const base = this.phase === PHASES.BOTTOM ? 85 : 95;
    return Math.round(base + (Math.random() * 6 - 3));
  }

  _simSpo2() {
    return Math.round(96 + (Math.random() * 3 - 1.5));
  }

  _simMotion() {
    return Number((0.3 + Math.random() * 0.4).toFixed(2));
  }

  isFinished() {
    return this.phase === PHASES.SURFACED;
  }
}

module.exports = { DiveProfileSimulator, PHASES };
