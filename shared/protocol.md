# Sanjeevani — Shared Data Protocol (v0 — DRAFT for Day 1–2 lock)

> Owned jointly by all four roles: Diver Systems, Mine Systems, Dashboard & UI,
> Integration & Safety. Only editable via reviewed PR.
> One packet format, one pipe: common fields + a domain-specific block, so
> Dashboard and Integration can write generic code for both domains while
> Diver Systems and Mine Systems each own only their own block.

## 1. Common fields (every packet, both domains)

| Field | Type | Example | Notes |
|---|---|---|---|
| `worker_id` | string (short) | `"D03"` / `"M07"` | Prefix by domain (D = diver, M = miner) for quick eyeballing. |
| `domain` | string enum | `"diver"` \| `"miner"` | Tells server/dashboard which block to expect below. |
| `ts` | int | `1753500000` | Unix timestamp (seconds). |
| `hr` | int | `118` | Heart rate, bpm. |
| `spo2` | int | `94` | Blood oxygen saturation, %. |
| `motion_g` | float | `2.1` | Motion/impact-G reading. |
| `pos_x` | float | `142.5` | Position X (dive grid or mine plan-view). |
| `pos_y` | float | `88.2` | Position Y. |
| `pos_z` | float | `-18.4` | Depth (diver, negative = below surface) or level (miner, e.g. floor -2). |
| `triage_tier` | string enum | `"green"` \| `"yellow"` \| `"red"` | Sent as part of the packet in this protocol (unlike a downstream-only field) — confirm on Day 1–2 whether this is computed client-side by each simulator or server-side by Integration before reaching Dashboard. |
| `battery_pct` | int | `76` | Device battery, %. |
| `comms_status` | string enum | `"ok"` \| `"degraded"` \| `"lost"` | Current link quality. |

## 2. Diver-only block (present when `domain = "diver"`)

| Field | Type | Example | Notes |
|---|---|---|---|
| `depth_m` | float | `18.4` | Current depth, meters. |
| `ascent_rate` | float | `0.3` | m/s, positive = ascending. Spike = DCS risk trigger. |
| `dive_time_elapsed` | int | `1620` | Seconds since dive start. |
| `n2_saturation_est` | float | `0.62` | Estimated nitrogen saturation, 0–1 scale (model owned by Diver Systems). |
| `air_supply_pct` | int | `54` | Remaining air supply, %. |

## 3. Miner-only block (present when `domain = "miner"`)

| Field | Type | Example | Notes |
|---|---|---|---|
| `co_ppm` | int | `35` | Carbon monoxide, ppm. |
| `ch4_pct` | float | `0.8` | Methane, %. |
| `o2_pct` | float | `20.1` | Ambient oxygen, %. |
| `ambient_temp_c` | float | `31.2` | Ambient temperature, °C. |
| `seismic_reading` | float | `0.15` | Tremor/seismic sensor value (unit TBD — discuss Day 1–2). |
| `self_rescuer_status` | string enum | `"stowed"` \| `"deployed"` | Whether self-rescuer breathing device is in use. |

## 4. Example packets

**Diver:**
```json
{
  "worker_id": "D03",
  "domain": "diver",
  "ts": 1753500000,
  "hr": 118,
  "spo2": 94,
  "motion_g": 2.1,
  "pos_x": 142.5,
  "pos_y": 88.2,
  "pos_z": -18.4,
  "triage_tier": "green",
  "battery_pct": 76,
  "comms_status": "ok",
  "depth_m": 18.4,
  "ascent_rate": 0.3,
  "dive_time_elapsed": 1620,
  "n2_saturation_est": 0.62,
  "air_supply_pct": 54
}
```

**Miner:**
```json
{
  "worker_id": "M07",
  "domain": "miner",
  "ts": 1753500000,
  "hr": 102,
  "spo2": 97,
  "motion_g": 0.4,
  "pos_x": 60.0,
  "pos_y": 12.5,
  "pos_z": -2,
  "triage_tier": "yellow",
  "battery_pct": 88,
  "comms_status": "ok",
  "co_ppm": 35,
  "ch4_pct": 0.8,
  "o2_pct": 20.1,
  "ambient_temp_c": 31.2,
  "seismic_reading": 0.15,
  "self_rescuer_status": "stowed"
}
```

## 5. Open questions for Day 1–2 discussion

- **`triage_tier` origin** — does each domain's simulator compute this itself, or is it always derived by a shared rules engine downstream? Whoever owns that logic needs to be explicit so Dashboard doesn't render a stale/missing value.
- **`pos_z` units** — meters for both, or does mine level need a different convention (e.g. floor number vs. meters below surface)? Affects how Dashboard's plan-view renders it.
- **`seismic_reading` unit/scale** — Mine Systems to propose based on whatever sensor model they're simulating.
- **Field presence validation** — should Integration reject/flag a packet if the wrong domain-block is attached (e.g. a diver packet with `co_ppm`)? Worth a one-line rule so this fails loud, not silent.

## 6. Sign-off

- [ ] Diver Systems
- [ ] Mine Systems
- [ ] Dashboard & UI
- [ ] Integration & Safety

*Target: lock as v1 on Day 2, all four sign off before anyone builds detection logic against it.*
