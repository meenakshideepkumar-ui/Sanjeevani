# Sanjeevani — Deep-Diver & Miner Safety Monitoring Platform

A real-time command dashboard for tracking the safety of deep-sea divers and underground miners, using a simulated telemetry engine feeding a live triage and alert system.

## Overview

Two very different sensor domains — underwater diving and underground mining — feed one shared alert pipeline:

- **Divers**: depth, ascent rate, nitrogen saturation, air supply, HR/SpO2 → decompression sickness (DCS), nitrogen narcosis, and low-air-supply detection
- **Miners**: gas levels (CO/CH4/O2), ambient temperature, seismic/motion readings, HR → gas exposure, cave-in/tremor, heat stress, and entrapment detection

Both domains report through one shared packet format into a unified command dashboard with live maps, alerts, offline/signal-loss handling, and incident reports.

## Project Structure

```
.
├── diver-systems/     # Dive-profile simulator + DCS/narcosis/O2 detection logic
├── mine-systems/      # Gas/seismic simulator + cave-in/gas-exposure/heat detection logic
├── dashboard/         # Frontend: Dive Ops view, Mine Ops view, shared alert components
├── integration/       # API/websocket server, positioning simulation, offline mode, auth, reports
└── shared/
    └── protocol.md    # Shared telemetry packet schema — the only file all contributors edit
```

## Ownership Rules (read before contributing)

To avoid merge conflicts, each folder has a single owner. **Do not edit outside your own folder.**

| Folder | Owner |
|---|---|
| `diver-systems/` | Diver Systems |
| `mine-systems/` | Mine Systems |
| `dashboard/` | Dashboard & UI |
| `integration/` | Integration & Safety |
| `shared/protocol.md` | Everyone, via reviewed PR only |

If your work genuinely requires a change in someone else's folder, open a PR and tag the owner — don't push directly to their files.

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: React / Next.js, Tailwind CSS, Leaflet (maps/plan views)
- **Reports**: PDF/CSV export (incident logs)

## Getting Started

```bash
# Clone the repo
git clone <repo-url>
cd sanjeevani

# Install dependencies (each folder has its own package.json)
cd integration && npm install
cd ../dashboard && npm install

# Run the backend (telemetry server)
cd integration && npm run dev

# Run the dashboard (in a separate terminal)
cd dashboard && npm run dev
```

The dashboard should be available at `http://localhost:3000`, connecting to the telemetry server at `http://localhost:5000` (adjust ports as configured).

## Branching & Workflow

- `main` is protected — no direct pushes.
- Work on feature branches named by folder and task, e.g. `diver-systems/dcs-detection`, `dashboard/mine-ops-map`.
- Open a PR into `main` when a feature is ready; at least one other team member reviews before merge.
- Sync as a team at the end of each week to catch schema drift early — see `shared/protocol.md` for the current packet format.

## Team

| Role | Responsibility |
|---|---|
| Diver Systems | Underwater telemetry simulation & dive-risk detection |
| Mine Systems | Underground telemetry simulation & mine-risk detection |
| Dashboard & UI | Unified command dashboard for both operations |
| Integration & Safety | Comms/API layer, offline handling, security, reports |

## License

TBD — add your license here before public release.
