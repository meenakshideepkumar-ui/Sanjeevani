# Integration & Safety (server) — VS Code Setup & Contribution Guide

This is the **Integration & Safety** layer: the telemetry API/WebSocket server
that ingests packets from both domains, validates them against
`shared/protocol.md`, runs the offline/signal-loss watchdog, handles auth, and
produces incident reports — while keeping the dashboard contract the current
stub already uses (port **5000**, event **`telemetry_update`**).

## Where this goes

Your folder is **`UI/server/`** (that's the Integration & Safety layer in the
actual repo — the README's idealised tree calls it `integration/`, but on disk
it's `UI/server/`). Drop these files into `UI/server/`, replacing the stub
`server.js` and the placeholder `package.json`. Don't touch `UI/dashboard/`
(Dashboard & UI's) or the domain folders — if you need a change there, open a PR
and tag the owner.

## Files

| File | Purpose |
|---|---|
| `server.js` | Entry point — Express + Socket.IO, REST routes, watchdog loop |
| `config.js` | Ports, timeouts, auth token, demo flag (all env-overridable) |
| `validate.js` | Protocol validation — the "fail loud" rule from protocol.md §5 |
| `hub.js` | The pipeline: ingest → validate → track → log incidents → broadcast |
| `watchdog.js` | Offline handling: `ok → degraded → lost` when a worker goes quiet |
| `positioning.js` | Latest position of every worker, for the map/plan-view |
| `auth.js` | Bearer-token auth for ingest (and optionally viewers) |
| `reports.js` | Incident log + CSV + PDF export (uses `pdfkit`) |
| `feed.js` | Built-in synthetic demo feed (`DEMO=1`) — no dependency on other folders |
| `bridge.js` | Pipe a real simulator's JSON output into `/ingest` |
| `test.js` | 15-check test suite (validation, broadcast, incidents, watchdog, reports) |

## 1. Branch & open in VS Code

```bash
git checkout -b integration/telemetry-server
code .
```

## 2. Install & run (VS Code terminal: Ctrl+` )

```bash
cd UI/server
npm install                 # express, cors, socket.io, pdfkit

npm run demo                # DEMO=1: built-in feed (2 divers + 2 miners) — instant live picture
# or
npm run dev                 # server only; feed it yourself via /ingest or the bridge
```

Then run the dashboard in a second terminal and open http://localhost:3000:

```bash
cd UI/dashboard
npm install
npm run dev
```

The dashboard connects to `http://localhost:5000` and listens for
`telemetry_update` — which this server emits — so it lights up immediately.

## 3. Feed it real telemetry (instead of the demo feed)

Any producer can push packets. Two ways:

- **Bridge a simulator's stdout** (it prints JSON lines):
  ```bash
  cd UI/server
  node "../../Diver Systems/run.js" --fleet=3 | node bridge.js
  ```
- **POST directly**:
  ```bash
  curl -X POST http://localhost:5000/ingest \
    -H 'Content-Type: application/json' \
    -d '{ ...a protocol packet... }'
  ```

## 4. API surface

| Route | What |
|---|---|
| `GET /health` | uptime + ingest/broadcast/reject counters |
| `POST /ingest` | producers push one packet or an array (auth-guarded if a token is set) |
| `GET /workers` | latest tier + comms status per worker |
| `GET /positions` | latest position per worker (for the map) |
| `GET /reports/incidents.json` | incident log |
| `GET /reports/incidents.csv` | CSV export |
| `GET /reports/incidents.pdf` | PDF export |
| socket `telemetry_update` | broadcast to the dashboard (unchanged contract) |
| socket `ingest` | authorised producers may stream over the socket |

## 5. Auth

Auth is **off by default** (easy local dev). To require a token for ingest:

```bash
API_TOKEN=some-secret npm start
# producers then send:  Authorization: Bearer some-secret
# lock viewers too with:  REQUIRE_VIEWER_AUTH=1
```

## 6. Offline handling (the safety net)

The watchdog sweeps every 2s. If a worker hasn't reported within
`DEGRADED_TIMEOUT_MS` (6s) it's marked `degraded`; past `OFFLINE_TIMEOUT_MS`
(12s) it's `lost`, an incident is logged, and the dashboard is told (the last
packet is re-broadcast with the new `comms_status`). When it reports again it
recovers. Tune the timeouts via env vars for a real device cadence.

## 7. Tests — run before every commit

```bash
npm test        # expect: 15 passed, 0 failed
```

## 8. Two protocol calls that are now YOURS to make

`shared/protocol.md` §5 lists open questions; two are Integration's to settle
(propose them at the next sync, and edit `protocol.md` only via a reviewed PR):

- **Field-presence validation** — done: this server rejects a packet with the
  wrong domain block (e.g. a diver packet carrying `co_ppm`) and logs why. You
  can tick the Integration sign-off box.
- **`triage_tier` origin** — right now each simulator sends its own tier and
  this server trusts it. Confirm with the team whether that stays client-side
  or whether Integration should re-derive it centrally; the hub is the place to
  add that if you go server-side.

## 9. Commit with clean attribution

```bash
git add UI/server
git commit -m "integration: telemetry server — ingest/validate/watchdog/auth/reports"
git push -u origin integration/telemetry-server
```

Open a PR into `main` and get one review. (If you're driving this through Claude
Code, keep the no-Claude-attribution rules from your earlier prompt.)
