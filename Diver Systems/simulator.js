const EventEmitter = require('events');
const {
  SAFE_ASCENT_RATE_MPS,
  NARCOSIS_DEPTH_THRESHOLD_M,
  SAFETY_STOP_DEPTH_M,
  SAFETY_STOP_DURATION_SEC,
  SAFETY_STOP_N2_THRESHOLD,
  SIGNAL_DROPOUT_DEFAULT_DEGRADE_SEC,
  SIGNAL_DROPOUT_DEFAULT_LOST_SEC,
} = require('./constants');
const { evaluateTriage } = require('./triage');

const PHASES = {
  DESCEND: 'descend',
  BOTTOM: 'bottom',
  SAFETY_STOP: 'safety_stop',
  ASCEND: 'ascend',
  SURFACED: 'surfaced',
};

class DiveProfileSimulator extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.workerId        e.g. "D01"
   * @param {number} opts.targetDepth     meters, positive (e.g. 18)
   * @param {number} opts.descentRate     m/s during descent (e.g. 0.5)
   * @param {number} opts.bottomTimeSec   seconds spent at target depth
   * @param {number} opts.ascentRate      m/s during normal ascent (e.g. 0.25, should be <= SAFE_ASCENT_RATE_MPS)
   * @param {number} opts.n2HalfTimeSec   tissue-loading half-time for the N2 model, seconds
   *   (default 900 = 15 min, approximating a mid/controlling recreational-depth
   *   tissue compartment — see constants.js Day 16 notes)
   * @param {number} opts.autoRapidAscentChance  0-1 probability per ascend-phase tick of auto-triggering a rapid-ascent spike (default 0)
   * @param {number} opts.autoDropoutChance  0-1 probability per tick (any phase) of auto-triggering a signal dropout (default 0)
   * @param {boolean} opts.enableSafetyStop  Day 17 (bonus) — whether to auto-insert a safety stop on ascent when N2 loading warrants it (default true)
   */
  constructor({
    workerId = 'D01',
    targetDepth = 18,
    descentRate = 0.5,
    bottomTimeSec = 900,
    ascentRate = 0.25,
    n2HalfTimeSec = 900,
    autoRapidAscentChance = 0,
    autoDropoutChance = 0,
    enableSafetyStop = true,
  } = {}) {
    super();
    this.workerId = workerId;
    this.domain = 'diver';

    this.targetDepth = targetDepth;
    this.descentRate = descentRate;
    this.bottomTimeSec = bottomTimeSec;
    this.ascentRate = ascentRate;
    this.n2HalfTimeSec = n2HalfTimeSec;
    this.autoRapidAscentChance = autoRapidAscentChance;
    this.autoDropoutChance = autoDropoutChance;
    this.enableSafetyStop = enableSafetyStop;

    this.depth = 0;
    this.phase = PHASES.DESCEND;
    this.elapsed = 0;
    this.bottomElapsed = 0;
    this.lastAscentRate = 0;
    this.n2Saturation = 0.21; 
    this.rapidAscentActive = false;
    this.rapidAscentRemaining = 0;
    this.rapidAscentRate = 0;
    this.dcsRiskFlag = false;
    this.manualDistressActive = false;
    this.commsStatus = 'ok';
    this.dropoutState = 'none';
    this.dropoutTimer = 0;
    this._pendingLostSec = 0;
    this._lastKnownPacket = null; 
    this.safetyStopDone = false;
    this.safetyStopRemaining = 0;
    this.airSupplyPct = 100;
    this.batteryPct = 100;
  }
  triggerDistress() {
    this.manualDistressActive = true;
  }
  clearDistress() {
    this.manualDistressActive = false;
  }
  triggerRapidAscent(rateMultiplier = 3, durationSec = 20) {
    this.rapidAscentActive = true;
    this.rapidAscentRemaining = durationSec;
    this.rapidAscentRate = SAFE_ASCENT_RATE_MPS * rateMultiplier;
  }
  triggerSignalDropout({
    degradeSec = SIGNAL_DROPOUT_DEFAULT_DEGRADE_SEC,
    lostSec = SIGNAL_DROPOUT_DEFAULT_LOST_SEC,
  } = {}) {
    this.dropoutState = 'degrading';
    this.dropoutTimer = degradeSec;
    this._pendingLostSec = lostSec;
    this.commsStatus = 'degraded';
    this.emit('signal_degraded', { workerId: this.workerId, ts: Math.floor(Date.now() / 1000) });
  }
  getLastKnownPacket() {
    return this._lastKnownPacket;
  }
  /**
   * Advance the simulation by dt seconds and emit + return the next packet.
   * Returns the packet even while comms are "lost" (Day 15) so local
   * callers/tests can still inspect ground truth — but does NOT emit the
   * 'packet' event in that case, since a real receiver wouldn't get it.
   * @param {number} dt seconds of simulated dive time to advance
   */
  step(dt) {
    this.elapsed += dt;
    let depthDelta = 0;
    if (this.dropoutState === 'none' && this.autoDropoutChance > 0) {
      if (Math.random() < this.autoDropoutChance) {
        this.triggerSignalDropout();
      }
    }

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
        if (!this.rapidAscentActive && this.autoRapidAscentChance > 0) {
          if (Math.random() < this.autoRapidAscentChance) {
            this.triggerRapidAscent();
          }
        }

        const effectiveRate = this.rapidAscentActive ? this.rapidAscentRate : this.ascentRate;
        const proposedDepth = Math.max(0, this.depth - effectiveRate * dt);
        const crossingStopBand = this.depth > SAFETY_STOP_DEPTH_M && proposedDepth <= SAFETY_STOP_DEPTH_M;
        const shouldStop =
          this.enableSafetyStop &&
          !this.safetyStopDone &&
          !this.rapidAscentActive && 
          this.targetDepth > SAFETY_STOP_DEPTH_M &&
          this.n2Saturation >= SAFETY_STOP_N2_THRESHOLD &&
          crossingStopBand;

        if (shouldStop) {
          this.depth = SAFETY_STOP_DEPTH_M;
          depthDelta = SAFETY_STOP_DEPTH_M - this.depth; 
          this.phase = PHASES.SAFETY_STOP;
          this.safetyStopRemaining = SAFETY_STOP_DURATION_SEC;
        } else {
          depthDelta = proposedDepth - this.depth;
          this.depth = proposedDepth;

          if (this.rapidAscentActive) {
            this.rapidAscentRemaining -= dt;
            if (this.rapidAscentRemaining <= 0 || this.depth <= 0) {
              this.rapidAscentActive = false;
              this.rapidAscentRemaining = 0;
            }
          }

          if (this.depth <= 0) this.phase = PHASES.SURFACED;
        }
        break;
      }
      case PHASES.SAFETY_STOP: {
        this.safetyStopRemaining -= dt;
        depthDelta = 0;
        if (this.safetyStopRemaining <= 0) {
          this.safetyStopDone = true;
          this.phase = PHASES.ASCEND;
        }
        break;
      }
      case PHASES.SURFACED: {
        depthDelta = 0;
        break;
      }
      default:
        break;
    }
    this.lastAscentRate = dt > 0 ? -(depthDelta / dt) : 0;
    this.dcsRiskFlag = this.lastAscentRate > SAFE_ASCENT_RATE_MPS;

    this._updateN2Saturation(dt);
    this._updateSignalDropout(dt);
    this.airSupplyPct = Math.max(0, this.airSupplyPct - dt * 0.01);
    this.batteryPct = Math.max(0, this.batteryPct - dt * 0.001);

    const packet = this.getPacket();

    if (this.dropoutState === 'lost') {
      return packet;
    }

    if (this.dropoutState === 'degrading') {
      this._lastKnownPacket = packet; 
    }

    this.emit('packet', packet);
    return packet;
  }
  _updateSignalDropout(dt) {
    if (this.dropoutState === 'degrading') {
      this.dropoutTimer -= dt;
      if (this.dropoutTimer <= 0) {
        this.dropoutState = 'lost';
        this.dropoutTimer = this._pendingLostSec;
        this.commsStatus = 'lost';
        this.emit('signal_lost', {
          workerId: this.workerId,
          ts: Math.floor(Date.now() / 1000),
          lastKnownPacket: this._lastKnownPacket,
        });
      }
    } else if (this.dropoutState === 'lost') {
      this.dropoutTimer -= dt;
      if (this.dropoutTimer <= 0) {
        this.dropoutState = 'none';
        this.commsStatus = 'ok';
        this.emit('signal_recovered', { workerId: this.workerId, ts: Math.floor(Date.now() / 1000) });
      }
    }
  }
  _updateN2Saturation(dt) {
    const absolutePressureAtm = 1 + this.depth / 10;
    const ambientN2Fraction = 0.79 * absolutePressureAtm;
    const normalizingConstant = 4; // maps ~40m ambient N2 pressure to a ceiling near 1.0
    const equilibrium = Math.min(1, ambientN2Fraction / normalizingConstant);

    const k = Math.LN2 / this.n2HalfTimeSec;
    this.n2Saturation += (equilibrium - this.n2Saturation) * (1 - Math.exp(-k * dt));
    this.n2Saturation = Math.max(0, Math.min(1, this.n2Saturation));
  }

  getPacket() {
    const depthM = Number(this.depth.toFixed(2));
    const ascentRate = Number(this.lastAscentRate.toFixed(3));
    const n2Sat = Number(this.n2Saturation.toFixed(3));
    const airSupplyPct = Math.round(this.airSupplyPct);

    const { tier, reasons } = evaluateTriage({
      ascent_rate: ascentRate,
      n2_saturation_est: n2Sat,
      depth_m: depthM,
      air_supply_pct: airSupplyPct,
      dive_time_elapsed: Math.floor(this.elapsed), 
    });

    const finalTier = this.manualDistressActive ? 'red' : tier;
    const finalReasons = this.manualDistressActive
      ? [...reasons, 'manual_distress_signal']
      : reasons;

    return {
      worker_id: this.workerId,
      domain: this.domain,
      ts: Math.floor(Date.now() / 1000),
      hr: this._simHr(),
      spo2: this._simSpo2(),
      motion_g: this._simMotion(),
      pos_x: 0, 
      pos_y: 0, 
      pos_z: -depthM,
      triage_tier: finalTier,
      battery_pct: Math.round(this.batteryPct),
      comms_status: this.commsStatus,
      depth_m: depthM,
      ascent_rate: ascentRate,
      dive_time_elapsed: Math.floor(this.elapsed),
      n2_saturation_est: n2Sat,
      air_supply_pct: airSupplyPct,
      _dcs_risk_flag: this.dcsRiskFlag,
      _narcosis_risk_flag: depthM >= NARCOSIS_DEPTH_THRESHOLD_M,
      _manual_distress_active: this.manualDistressActive,
      _triage_reasons: finalReasons,
      _at_safety_stop: this.phase === PHASES.SAFETY_STOP, // Day 17
      _safety_stop_remaining_sec: this.phase === PHASES.SAFETY_STOP ? Math.ceil(this.safetyStopRemaining) : 0,
      _dropout_state: this.dropoutState, 
    };
  }

  _simHr() {
    const base = this.phase === PHASES.BOTTOM ? 85 : 95;
    const spikeBoost = this.rapidAscentActive ? 15 : 0;
    return Math.round(base + spikeBoost + (Math.random() * 6 - 3));
  }

  _simSpo2() {
    const spikeDrop = this.rapidAscentActive ? 3 : 0;
    return Math.round(96 - spikeDrop + (Math.random() * 3 - 1.5));
  }

  _simMotion() {
    const base = this.rapidAscentActive ? 1.2 : 0.3;
    return Number((base + Math.random() * 0.4).toFixed(2));
  }

  isFinished() {
    return this.phase === PHASES.SURFACED;
  }
}

module.exports = { DiveProfileSimulator, PHASES, SAFE_ASCENT_RATE_MPS, NARCOSIS_DEPTH_THRESHOLD_M };
