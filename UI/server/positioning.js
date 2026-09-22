// Integration & Safety — positioning store + simulation.
// Producers own movement; Integration normalizes and serves the latest position
// of every worker for the dashboard's map/plan-view, and can gently simulate
// drift for a worker whose device has gone quiet (so the map isn't frozen).

class Positioning {
  constructor() {
    this.pos = new Map(); // worker_id -> { x, y, z, domain, ts }
  }

  update(packet) {
    this.pos.set(packet.worker_id, {
      x: packet.pos_x, y: packet.pos_y, z: packet.pos_z,
      domain: packet.domain, ts: packet.ts,
    });
  }

  get(workerId) { return this.pos.get(workerId) || null; }

  all() {
    return Array.from(this.pos.entries()).map(([worker_id, v]) => ({ worker_id, ...v }));
  }

  /** Optional: nudge a stale worker's position a little (demo continuity). */
  simulateDrift(workerId, meters = 0.5) {
    const p = this.pos.get(workerId);
    if (!p) return;
    p.x += (Math.random() - 0.5) * meters;
    p.y += (Math.random() - 0.5) * meters;
  }
}

module.exports = { Positioning };
