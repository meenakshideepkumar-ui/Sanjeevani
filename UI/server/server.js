// Sanjeevani — Integration & Safety server (entry point).
// Express + Socket.IO. Ingest telemetry (HTTP or socket), validate it against
// the shared protocol, run the offline watchdog, log incidents, and broadcast
// to the dashboard on the existing 'telemetry_update' event (port 5000).
//
//   npm run dev            # server only (feed it via POST /ingest)
//   npm run demo           # DEMO=1: built-in synthetic feed for a live picture
//   API_TOKEN=... npm start # require a bearer token to ingest

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const cfg = require('./config');
const { Watchdog } = require('./watchdog');
const { Positioning } = require('./positioning');
const { Reports } = require('./reports');
const { TelemetryHub } = require('./hub');
const { restAuth, socketConnectAuth, socketCanIngest } = require('./auth');
const { startDemoFeed } = require('./feed');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '256kb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const watchdog = new Watchdog({ degradedMs: cfg.DEGRADED_TIMEOUT_MS, offlineMs: cfg.OFFLINE_TIMEOUT_MS });
const positioning = new Positioning();
const reports = new Reports();
const hub = new TelemetryHub({ io, cfg, watchdog, positioning, reports });

hub.on('rejected', ({ errors }) => console.warn('[reject]', errors.join(' | ')));
hub.on('incident', (inc) => console.log(`[incident] #${inc.id} ${inc.type} ${inc.worker_id} (${inc.domain})`));

// ---- REST API ----
app.get('/', (req, res) => res.send('Sanjeevani Telemetry Server (Integration & Safety) running'));
app.get('/health', (req, res) => res.json({ ok: true, uptime_s: Math.round(process.uptime()), stats: hub.stats }));

// producers push telemetry here (auth-guarded when API_TOKEN is set)
app.post('/ingest', restAuth(cfg), (req, res) => {
  const body = Array.isArray(req.body) ? req.body : [req.body];
  const results = body.map((p) => hub.ingest(p));
  const bad = results.find((r) => !r.ok);
  res.status(bad ? 400 : 202).json({ accepted: results.filter((r) => r.ok).length, results });
});

app.get('/workers', (req, res) => res.json(hub.workers()));
app.get('/positions', (req, res) => res.json(positioning.all()));

app.get('/reports/incidents.json', restAuth(cfg), (req, res) => res.json(reports.all()));
app.get('/reports/incidents.csv', restAuth(cfg), (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="incidents.csv"');
  res.send(reports.toCSV());
});
app.get('/reports/incidents.pdf', restAuth(cfg), (req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="incidents.pdf"');
  reports.toPDF(res);
});

// ---- WebSocket ----
io.use(socketConnectAuth(cfg));
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // let authorised producers stream telemetry over the socket too
  socket.on('ingest', (packet) => {
    if (!socketCanIngest(cfg, socket)) return socket.emit('ingest_error', { error: 'unauthorized' });
    const r = hub.ingest(packet);
    if (!r.ok) socket.emit('ingest_error', { errors: r.errors });
  });
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ---- Offline watchdog loop ----
setInterval(() => {
  for (const t of watchdog.sweep()) {
    console.log(`[watchdog] ${t.worker_id}: ${t.from} -> ${t.to}`);
    hub.onTransition(t);
  }
}, cfg.WATCHDOG_INTERVAL_MS);

if (cfg.DEMO) {
  startDemoFeed(hub);
  console.log('[demo] synthetic feed started (2 divers + 2 miners)');
}

server.listen(cfg.PORT, () => {
  console.log(`Telemetry server on http://localhost:${cfg.PORT}  (event: ${cfg.TELEMETRY_EVENT})`);
  if (cfg.API_TOKEN) console.log('[auth] ingest requires a bearer token');
});

module.exports = { app, server, io, hub, watchdog, positioning, reports };
