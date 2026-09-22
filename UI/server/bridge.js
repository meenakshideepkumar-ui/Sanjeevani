// Integration & Safety — producer bridge.
// Pipes any simulator's JSON-lines stdout into the server's /ingest endpoint,
// so real diver/mine telemetry flows in without coupling to their folders.
//
//   node "../../Diver Systems/run.js" --fleet=3 | node bridge.js
//   INGEST_URL=http://localhost:5000/ingest API_TOKEN=secret node ... | node bridge.js
//
// Non-JSON lines (e.g. a simulator's stderr notes) are skipped.

const readline = require('readline');
const url = process.env.INGEST_URL || 'http://localhost:5000/ingest';
const token = process.env.API_TOKEN || null;

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  line = line.trim();
  if (!line) return;
  let pkt;
  try { pkt = JSON.parse(line); } catch { return; } // skip non-JSON
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(pkt),
    });
    if (!res.ok) process.stderr.write(`[bridge] ${res.status} for ${pkt.worker_id}\n`);
  } catch (e) {
    process.stderr.write(`[bridge] ingest failed: ${e.message}\n`);
  }
});
