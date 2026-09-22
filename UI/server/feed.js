// Integration & Safety — built-in demo feed (self-contained; DEMO=1).
// Generates protocol-valid packets for a couple of divers and miners so the
// server + dashboard show life without depending on the other teams' folders.
// Real producers should POST /ingest (or emit 'ingest') instead of this.

function rand(a, b) { return a + Math.random() * (b - a); }
function round(v, n = 2) { const f = 10 ** n; return Math.round(v * f) / f; }
const nowTs = () => Math.floor(Date.now() / 1000);

function diverPacket(id, i) {
  const red = Math.random() < 0.03, yellow = !red && Math.random() < 0.12;
  return {
    worker_id: id, domain: 'diver', ts: nowTs(),
    hr: Math.round(red ? rand(150, 175) : rand(70, 110)),
    spo2: Math.round(red ? rand(80, 88) : rand(95, 99)),
    motion_g: round(rand(0.8, 1.4)),
    pos_x: round(11.87 + i * 0.001, 5), pos_y: round(75.37 + i * 0.001, 5), pos_z: round(rand(-30, -5), 1),
    triage_tier: red ? 'red' : yellow ? 'yellow' : 'green',
    battery_pct: Math.round(rand(60, 95)), comms_status: 'ok',
    depth_m: round(rand(5, 30), 1), ascent_rate: round(rand(-0.2, 0.5), 2),
    dive_time_elapsed: 600 + i * 30, n2_saturation_est: round(rand(0.3, 0.7), 2),
    air_supply_pct: Math.round(rand(40, 90)),
  };
}
function minerPacket(id, i) {
  const red = Math.random() < 0.03, yellow = !red && Math.random() < 0.12;
  return {
    worker_id: id, domain: 'miner', ts: nowTs(),
    hr: Math.round(red ? rand(150, 175) : rand(75, 110)),
    spo2: Math.round(red ? rand(80, 88) : rand(95, 99)),
    motion_g: round(red ? rand(5.5, 8) : rand(0, 1.5)),
    pos_x: round(60 + i * 3, 1), pos_y: round(12.5 + i * 2, 1), pos_z: -1 * (1 + (i % 3)),
    triage_tier: red ? 'red' : yellow ? 'yellow' : 'green',
    battery_pct: Math.round(rand(60, 95)), comms_status: 'ok',
    co_ppm: Math.round(yellow ? rand(35, 60) : rand(2, 15)),
    ch4_pct: round(rand(0.05, 0.4), 2), o2_pct: round(rand(20.4, 20.9), 1),
    ambient_temp_c: round(rand(24, 33), 1), seismic_reading: round(rand(0.01, 0.08), 2),
    self_rescuer_status: red ? 'deployed' : 'stowed',
  };
}

function startDemoFeed(hub, { intervalMs = 3000 } = {}) {
  const roster = [
    ['D01', 'diver'], ['D02', 'diver'],
    ['M01', 'miner'], ['M02', 'miner'],
  ];
  let i = 0;
  return setInterval(() => {
    roster.forEach(([id, domain], idx) => {
      hub.ingest(domain === 'diver' ? diverPacket(id, idx) : minerPacket(id, idx));
    });
    i++;
  }, intervalMs);
}

module.exports = { startDemoFeed, diverPacket, minerPacket };
