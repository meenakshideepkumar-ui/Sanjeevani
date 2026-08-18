const EventEmitter = require('events');

const PHASES = {
  DESCEND: 'descend',
  BOTTOM: 'bottom',
  ASCEND: 'ascend',
  SURFACED: 'surfaced',
};

class DiveProfileSimulator extends EventEmitter {
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
    this.airSupplyPct = 100;
    this.batteryPct = 100;
  }
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
  getPacket() {
    return {
      worker_id: this.workerId,
      domain: this.domain,
      ts: Math.floor(Date.now() / 1000),
      hr: this._simHr(),
      spo2: this._simSpo2(),
      motion_g: this._simMotion(),
      pos_x: 0, 
      pos_y: 0, 
      pos_z: -Number(this.depth.toFixed(2)),
      triage_tier: 'green', 
      battery_pct: Math.round(this.batteryPct),
      comms_status: 'ok',
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
