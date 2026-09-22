// Integration & Safety — offline / signal-loss watchdog.
// The server is the safety net across ALL workers: if a device stops reporting,
// the watchdog downgrades its comms_status (ok -> degraded -> lost) and reports
// the transitions, so a diver/miner going dark is never silently "still green".

class Watchdog {
  constructor({ degradedMs, offlineMs }) {
    this.degradedMs = degradedMs;
    this.offlineMs = offlineMs;
    this.lastSeen = new Map(); // worker_id -> ms
    this.state = new Map();    // worker_id -> 'ok' | 'degraded' | 'lost'
  }

  /** Call whenever a valid packet arrives. */
  mark(workerId) {
    this.lastSeen.set(workerId, Date.now());
    if (!this.state.has(workerId)) this.state.set(workerId, 'ok');
  }

  /** Recompute states; return the transitions since last sweep. */
  sweep(now = Date.now()) {
    const transitions = [];
    for (const [id, seen] of this.lastSeen) {
      const age = now - seen;
      const next = age > this.offlineMs ? 'lost' : age > this.degradedMs ? 'degraded' : 'ok';
      const prev = this.state.get(id) || 'ok';
      if (next !== prev) {
        this.state.set(id, next);
        transitions.push({ worker_id: id, from: prev, to: next, age_ms: age });
      }
    }
    return transitions;
  }

  status(workerId) { return this.state.get(workerId) || 'ok'; }
}

module.exports = { Watchdog };
