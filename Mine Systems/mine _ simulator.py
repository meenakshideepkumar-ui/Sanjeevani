"""
Sanjeevani — Mine Systems
Day 3: Mine simulator — gas levels, temp, motion for 1 miner.

Emits packets matching shared/protocol.md v1 (miner domain):
  common fields + miner-only block.

Keep it simple for now:
  - one hardcoded miner
  - "normal shift" baseline values with small random drift
  - no danger events yet (that's Day 5-6)
  - no triage_tier logic yet (that's Day 8-9) -> sent as "green" placeholder
  - prints packets to console every few seconds (swap for websocket later)
"""

import json
import random
import time

# --- Config -----------------------------------------------------------

MINER_ID = "M07"
INTERVAL_SECONDS = 3          # how often a packet is emitted
STARTING_POS = (60.0, 12.5, -2)  # pos_x, pos_y, pos_z (level -2)

# "Normal shift" baseline values — tweak these as you learn more from
# real occupational-safety numbers later (Day 16 task)
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


def drift(value, spread, min_val=None, max_val=None):
    """Small random walk around a value, optionally clamped."""
    new_val = value + random.uniform(-spread, spread)
    if min_val is not None:
        new_val = max(min_val, new_val)
    if max_val is not None:
        new_val = min(max_val, new_val)
    return round(new_val, 2)


def build_packet(state):
    """Build one miner packet matching the locked protocol schema."""
    # slow drift for gas/temp/vitals — "steady gas/motion" per Day 4 task
    state["hr"] = drift(state["hr"], 2, min_val=60, max_val=110)
    state["spo2"] = drift(state["spo2"], 0.5, min_val=90, max_val=100)
    state["co_ppm"] = drift(state["co_ppm"], 1, min_val=0, max_val=200)
    state["ch4_pct"] = drift(state["ch4_pct"], 0.02, min_val=0, max_val=5)
    state["o2_pct"] = drift(state["o2_pct"], 0.1, min_val=15, max_val=21)
    state["ambient_temp_c"] = drift(state["ambient_temp_c"], 0.3, min_val=20, max_val=45)
    state["seismic_reading"] = drift(state["seismic_reading"], 0.01, min_val=0, max_val=5)
    state["battery_pct"] = max(0, state["battery_pct"] - 0.05)  # slow drain

    motion_g = round(random.uniform(0.0, 1.5), 2)  # light shift motion, no spikes yet

    packet = {
        "worker_id": MINER_ID,
        "domain": "miner",
        "ts": int(time.time()),
        "hr": int(state["hr"]),
        "spo2": int(state["spo2"]),
        "motion_g": motion_g,
        "pos_x": STARTING_POS[0],
        "pos_y": STARTING_POS[1],
        "pos_z": STARTING_POS[2],
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
    state = dict(BASELINE)  # mutable copy we drift over time
    print(f"Mine simulator started for {MINER_ID} — Ctrl+C to stop\n")
    try:
        while True:
            packet = build_packet(state)
            print(json.dumps(packet))
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")


if __name__ == "__main__":
    run()
