// Integration & Safety — the telemetry hub.
// One place where every packet flows: ingest -> validate -> track (watchdog +
// positioning) -> log incidents -> broadcast to the dashboard. Keeps the
// existing 'telemetry_update' contract so the current dashboard keeps working.

const EventEmitter = require('events');
const { validatePacket } = require('./validate');

class TelemetryHub extends EventEmitter {
  constructor({ io, cfg, watchdog, positioning, reports }) {
    super();
    this.io = io; 
    this.cfg = cfg || { TELEMETRY_EVENT: 'telemetry_update' };
    this.watchdog = watchdog || { mark: () => {}, status: () => 'ok' }; 
    this.positioning = positioning || { update: () => {} }; 
    this.reports = reports || { record: () => ({}) };
    
    this.last = new Map();      // worker_id -> last valid packet
    this.lastTier = new Map();  // worker_id -> last triage_tier (for edge-triggered incidents)
    this.stats = { received: 0, rejected: 0, broadcast: 0 };
  }

  /** Ingest one packet from any producer (HTTP or socket). */
  ingest(packet) {
    this.stats.received++;
    const { ok, errors } = validatePacket(packet);
    if (!ok) {
      this.stats.rejected++;
      this.emit('rejected', { packet, errors });
      return { ok: false, errors };
    }

    this.watchdog.mark(packet.worker_id);
    this.positioning.update(packet);

    // edge-triggered casualty incident: green/yellow -> red
    const prevTier = this.lastTier.get(packet.worker_id);
    if (packet.triage_tier === 'red' && prevTier !== 'red') {
      const inc = this.reports.record({
        worker_id: packet.worker_id, 
        domain: packet.domain, 
        type: 'casualty',
        tier: 'red', 
        reasons: packet._triage_reasons || packet.reasons || [], 
        ts: packet.ts,
      });
      this.emit('incident', inc);
    }
    this.lastTier.set(packet.worker_id, packet.triage_tier);
    this.last.set(packet.worker_id, packet);

    if (this.io) {
      this.io.emit(this.cfg.TELEMETRY_EVENT, packet);
    }
    this.stats.broadcast++;
    return { ok: true };
  }

  /** Called with each watchdog transition; logs + tells the dashboard. */
  onTransition(t) {
    const last = this.last.get(t.worker_id);
    if (t.to === 'lost') {
      const inc = this.reports.record({
        worker_id: t.worker_id, 
        domain: last && last.domain, 
        type: 'signal_lost',
        ts: Math.floor(Date.now() / 1000),
      });
      this.emit('incident', inc);
    } else if (t.to === 'ok' && t.from === 'lost') {
      this.reports.record({
        worker_id: t.worker_id, 
        domain: last && last.domain, 
        type: 'recovered',
        ts: Math.floor(Date.now() / 1000),
      });
    }
    // re-broadcast the last packet with the new comms_status so the map updates
    if (last && this.io) {
      const synth = { ...last, comms_status: t.to, ts: Math.floor(Date.now() / 1000) };
      this.io.emit(this.cfg.TELEMETRY_EVENT, synth);
    }
  }

  workers() {
    return Array.from(this.last.values()).map((p) => ({
      worker_id: p.worker_id, 
      domain: p.domain, 
      triage_tier: p.triage_tier,
      comms_status: this.watchdog.status(p.worker_id), 
      last_ts: p.ts,
    }));
  }
}

module.exports = { TelemetryHub };
