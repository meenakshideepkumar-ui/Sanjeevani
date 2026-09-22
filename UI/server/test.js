// Integration & Safety — test suite (no framework). Run: node test.js
const { validatePacket } = require('./validate');
const { Watchdog } = require('./watchdog');
const { Positioning } = require('./positioning');
const { Reports } = require('./reports');
const { TelemetryHub } = require('./hub');
const { diverPacket, minerPacket } = require('./feed');

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => cond
  ? (passed++, console.log(`  ok   ${name}`))
  : (failed++, console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`));
const section = (t) => console.log(`\n${t}`);

const cfg = { TELEMETRY_EVENT: 'telemetry_update' };
// a fake Socket.IO that just records what would be broadcast
function fakeIo() { const sent = []; return { sent, emit: (ev, p) => sent.push({ ev, p }) }; }
function makeHub() {
  const io = fakeIo();
  const watchdog = new Watchdog({ degradedMs: 6000, offlineMs: 12000 });
  const hub = new TelemetryHub({ io, cfg, watchdog, positioning: new Positioning(), reports: new Reports() });
  return { io, hub, watchdog };
}

section('1. Protocol validation (fail loud)');
{
  const ok = validatePacket(minerPacket('M01', 0));
  check('a well-formed miner packet passes', ok.ok, ok.errors.join('|'));
  check('a well-formed diver packet passes', validatePacket(diverPacket('D01', 0)).ok);

  const wrongBlock = { ...minerPacket('M01', 0), depth_m: 10 }; // miner carrying a diver field
  const r = validatePacket(wrongBlock);
  check('a miner packet with a stray diver field is rejected', !r.ok, r.errors.join('|'));

  const missing = { ...diverPacket('D01', 0) }; delete missing.hr;
  check('a packet missing a common field is rejected', !validatePacket(missing).ok);

  const badDomain = { ...minerPacket('M01', 0), domain: 'astronaut' };
  check('an unknown domain is rejected', !validatePacket(badDomain).ok);
}

section('2. Hub broadcast + rejection');
{
  const { io, hub } = makeHub();
  hub.ingest(diverPacket('D01', 0));
  check('a valid packet is broadcast on telemetry_update', io.sent.some((m) => m.ev === 'telemetry_update'));
  const before = hub.stats.rejected;
  hub.ingest({ domain: 'diver' }); // garbage
  check('an invalid packet is rejected, not broadcast', hub.stats.rejected === before + 1);
}

section('3. Casualty incident is edge-triggered (once per red episode)');
{
  const { hub } = makeHub();
  const green = { ...minerPacket('M09', 0), triage_tier: 'green' };
  const red = { ...minerPacket('M09', 0), triage_tier: 'red', _triage_reasons: ['impact + crash'] };
  hub.ingest(green);
  hub.ingest(red);
  hub.ingest(red); // still red — must NOT log a second incident
  const casualties = hub.reports.all().filter((i) => i.type === 'casualty' && i.worker_id === 'M09');
  check('exactly one casualty incident is logged for a sustained red', casualties.length === 1, `got ${casualties.length}`);
  check('the incident captured the reasons', casualties[0].reasons.includes('impact'));
}

section('4. Offline watchdog: ok -> lost, then recovered');
{
  const { hub, watchdog } = makeHub();
  hub.ingest(minerPacket('M05', 0));
  // pretend 20s passed with no packet
  watchdog.lastSeen.set('M05', Date.now() - 20000);
  const t1 = watchdog.sweep();
  t1.forEach((t) => hub.onTransition(t));
  check('a silent worker transitions to lost', watchdog.status('M05') === 'lost');
  check('a signal_lost incident is logged', hub.reports.all().some((i) => i.type === 'signal_lost' && i.worker_id === 'M05'));

  hub.ingest(minerPacket('M05', 0)); // it comes back
  const t2 = watchdog.sweep();
  t2.forEach((t) => hub.onTransition(t));
  check('the worker recovers to ok', watchdog.status('M05') === 'ok');
  check('a recovered incident is logged', hub.reports.all().some((i) => i.type === 'recovered' && i.worker_id === 'M05'));
}

section('5. Reports export');
{
  const { hub } = makeHub();
  hub.ingest({ ...diverPacket('D02', 0), triage_tier: 'green' });
  hub.ingest({ ...diverPacket('D02', 0), triage_tier: 'red' });
  const csv = hub.reports.toCSV();
  check('CSV has a header row', csv.startsWith('id,at_iso,worker_id'));
  check('CSV contains the casualty row', csv.includes('casualty') && csv.includes('D02'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
