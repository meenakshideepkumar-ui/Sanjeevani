"""
Sanjeevani — Mine Systems
Day 5: Gas-level drift + slow accumulation model.

Builds on Day 4's multi-miner simulator. Up to now, gas values only
random-walked around a flat baseline forever - realistic-looking noise,
but nothing ever actually got worse. Day 5 adds a slow *directional*
accumulation on top of that noise for miners in a "poor ventilation"
zone, so CO/CH4 can genuinely trend upward over the shift instead of
just idling - the first step toward a believable "problem developing"
story (which Day 6 will turn into a sudden spike/trigger).

Emits packets matching shared/protocol.md v1 (miner domain):
  common fields + miner-only block.

Still in scope for Day 5 only:
  - accumulation is slow and bounded (plateaus, doesn't run away to infinity)
  - no sudden spike/tremor event yet (that's Day 6)
  - no triage_tier logic yet (that's Day 8-9) -> sent as "green" placeholder
  - prints packets to console every few seconds (swap for websocket later)
"""

import json
import random
import time

# --- Config -----------------------------------------------------------

INTERVAL_SECONDS = 3  # how often a packet round is emitted (all miners each round)

# One entry per miner: worker_id -> starting position (pos_x, pos_y, pos_z)
MINERS = {
    "M07": (60.0, 12.5, -2),
    "M08": (65.0, 10.0, -2),
    "M09": (58.0, 20.0, -3),
}

# NEW for Day 5: per-miner ventilation profile.
#   "steady"       -> gas values just noise around baseline, like Day 4
#   "accumulating" -> gas values noise + a slow upward trend (poor ventilation zone)
# M09 is placed in a lower-airflow pocket for this demo, so the accumulation
# story has somewhere real to happen without touching M07/M08's behavior.
VENTILATION_PROFILE = {
    "M07": "steady",
    "M08": "steady",
    "M09": "accumulating",
}

# "Normal shift" baseline values - same starting point for every miner,
# each then drifts independently once the sim is running.
BASELINE = {
    "hr": 85,
    "spo2": 98,
    "co_ppm": 5,
    "ch4_pct": 0.1,
    "o2_pct": 20.9,
    "ambient_temp_c": 26.0,
    "seismic_reading": 0.02,
    "battery_pct": 100,
}

# NEW for Day 5: how fast an "accumulating" miner's gas readings trend
# upward per tick, and the plateau they level off toward. Kept gentle and
# bounded on purpose - this is slow build-up over a shift, not a spike.
ACCUMULATION = {
    "co_ppm": {"rate": 0.4, "ceiling": 120},
    "ch4_pct": {"rate": 0.015, "ceiling": 3.0},
}


def drift(value, spread, min_val=None, max_val=None):
    """Small random walk around a value, optionally clamped."""
    new_val = value + random.uniform(-spread, spread)
    if min_val is not None:
        new_val = max(min_val, new_val)
    if max_val is not None:
        new_val = min(max_val, new_val)
    return round(new_val, 2)


def accumulate(value, field):
    """
    Nudge a gas value slowly toward its ceiling. Slows down as it
    approaches the ceiling so it plateaus instead of clipping hard -
    reads as a believable slow build-up rather than a ramp to a wall.
    """
    cfg = ACCUMULATION[field]
    rate = cfg["rate"]
    ceiling = cfg["ceiling"]
    remaining = max(0.0, ceiling - value)
    step = rate * (remaining / ceiling)
    return round(min(ceiling, value + step), 3)


def build_packet(worker_id, pos, state, profile):
    """Build one miner packet matching the locked protocol schema."""
    # vitals: same gentle noise as Day 4, unaffected by ventilation profile
    state["hr"] = drift(state["hr"], 2, min_val=60, max_val=110)
    state["spo2"] = drift(state["spo2"], 0.5, min_val=90, max_val=100)
    state["ambient_temp_c"] = drift(state["ambient_temp_c"], 0.3, min_val=20, max_val=45)
    state["seismic_reading"] = drift(state["seismic_reading"], 0.01, min_val=0, max_val=5)
    state["battery_pct"] = max(0, state["battery_pct"] - 0.05)  # slow drain
    state["o2_pct"] = drift(state["o2_pct"], 0.1, min_val=15, max_val=21)

    # gas readings: noise as before, PLUS a slow directional trend if this
    # miner is in an "accumulating" (poor ventilation) zone
    if profile == "accumulating":
        state["co_ppm"] = accumulate(state["co_ppm"], "co_ppm")
        state["ch4_pct"] = accumulate(state["ch4_pct"], "ch4_pct")
    else:
        state["co_ppm"] = drift(state["co_ppm"], 1, min_val=0, max_val=200)
        state["ch4_pct"] = drift(state["ch4_pct"], 0.02, min_val=0, max_val=5)

    motion_g = round(random.uniform(0.0, 1.5), 2)  # light shift motion, no spikes yet

    packet = {
        "worker_id": worker_id,
        "domain": "miner",
        "ts": int(time.time()),
        "hr": int(state["hr"]),
        "spo2": int(state["spo2"]),
        "motion_g": motion_g,
        "pos_x": pos[0],
        "pos_y": pos[1],
        "pos_z": pos[2],
        "triage_tier": "green",  # placeholder until Day 8-9 triage engine exists
        "battery_pct": round(state["battery_pct"], 1),
        "comms_status": "ok",
        "co_ppm": int(state["co_ppm"]),
        "ch4_pct": state["ch4_pct"],
        "o2_pct": state["o2_pct"],
        "ambient_temp_c": state["ambient_temp_c"],
        "seismic_reading": state["seismic_reading"],
        "self_rescuer_status": "stowed",
    }
    return packet


def run():
    # each miner gets an independent copy of the baseline so they drift separately
    states = {worker_id: dict(BASELINE) for worker_id in MINERS}

    print(f"Mine simulator started for {len(MINERS)} miners: {', '.join(MINERS)} — Ctrl+C to stop")
    print(f"Ventilation profiles: {VENTILATION_PROFILE}\n")
    try:
        while True:
            for worker_id, pos in MINERS.items():
                profile = VENTILATION_PROFILE.get(worker_id, "steady")
                packet = build_packet(worker_id, pos, states[worker_id], profile)
                print(json.dumps(packet))
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")


if __name__ == "__main__":
    run()
