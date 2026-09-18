"""
Sanjeevani - Mine Systems
Day 7: casualty events + triage wired in + live output.

Builds on the Day 5 simulator (gas drift / slow accumulation).

Day 6 - Red condition
  - triage.py now decides green / yellow / red for every packet
    (Red = impact spike AND HR/SpO2 crash together).
  - the simulator can now *produce* a casualty: a "strain" phase (vitals
    worsen -> yellow) and a "hit" phase (one impact spike, then vitals crash
    -> red). Without this nothing in the sim could ever turn red.

Day 7 - sync loop
  - every packet carries triage_tier and is printed as one JSON line, and
    optionally pushed over a WebSocket (--ws) so the server/map can colour
    the pin live.
  - --demo runs the scripted story for M07: normal -> yellow -> red.
  - triage transitions are printed to stderr so stdout stays pure JSON lines.

Also changed from Day 5 (needed so triage has no false positives):
  - vitals / steady-gas now random-walk around a baseline with a gentle pull
    back to it (settle). The old unbounded walk could wander into "yellow"
    territory by chance over a long shift.
  - accumulating miners now get noise ON TOP of the trend, as the Day 5
    docstring promised (before, M09's gas line was perfectly smooth).

Day 10 - manual panic-button trigger
  - trigger_panic(state) simulates a worker pressing a distress button.
    Unlike a phase (strain/hit persist tick-to-tick, changing how vitals
    move), a button press is a single momentary event: it does NOT touch
    phase, motion, or vitals at all - it just makes panic=True show up on
    the very next packet built for that miner, then clears itself. That
    one field is enough: triage.py treats panic=True as an immediate,
    unconditional Red, independent of impact/crash.
  - this is why it's a separate one-shot flag instead of a fourth phase -
    a real device reports "button was pressed" once, not "button is being
    held", and a panic press can happen to a miner who is otherwise
    perfectly healthy (no strain, no hit).

Usage:
  python mine_simulator.py                      # normal run, all miners healthy-ish
  python mine_simulator.py --demo               # scripted M07 casualty
  python mine_simulator.py --demo --ws ws://localhost:8765
  python mine_simulator.py --demo --interval 1 --seed 42
"""

import argparse
import json
import random
import sys
import time

from triage import TriageEngine

# --- Config -----------------------------------------------------------

INTERVAL_SECONDS = 3  # how often a packet round is emitted (all miners each round)

# worker_id -> starting position (pos_x, pos_y, pos_z)
MINERS = {
    "M07": (60.0, 12.5, -2),
    "M08": (65.0, 10.0, -2),
    "M09": (58.0, 20.0, -3),
}

# "steady"       -> gas is noise around baseline
# "accumulating" -> gas is noise + slow upward trend (poor ventilation pocket)
VENTILATION_PROFILE = {
    "M07": "steady",
    "M08": "steady",
    "M09": "accumulating",
}

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

ACCUMULATION = {
    "co_ppm": {"rate": 0.4, "ceiling": 120},
    "ch4_pct": {"rate": 0.015, "ceiling": 3.0},
}

# noise added on top of the accumulation trend
ACCUM_NOISE = {"co_ppm": 1.0, "ch4_pct": 0.02}

# --- Day 6: casualty phases ---------------------------------------------
# Vitals move toward these targets, closing CASUALTY_PULL of the gap per tick.
CASUALTY_TARGETS = {
    "strain": {"hr": 128, "spo2": 92},   # exertion / early distress -> yellow
    "hit":    {"hr": 148, "spo2": 84},   # shock-type crash          -> red
}
CASUALTY_PULL = 0.4
IMPACT_RANGE = (5.5, 8.0)  # g, the one-shot impact spike (normal motion is 0-1.5)

# Demo story: (seconds after start, worker, phase)
DEMO_SCRIPT = [
    (15, "M07", "strain"),
    (36, "M07", "hit"),
]


# --- Helpers ------------------------------------------------------------

def settle(value, target, spread, pull, lo, hi):
    """Random walk that is gently pulled back toward `target`, clamped to [lo, hi]."""
    v = value + (target - value) * pull + random.uniform(-spread, spread)
    return round(min(hi, max(lo, v)), 2)


def approach(value, target, pull, spread, lo, hi):
    """Move `pull` of the way to `target` plus a little noise (casualty phases)."""
    v = value + (target - value) * pull + random.uniform(-spread, spread)
    return round(min(hi, max(lo, v)), 2)


def accumulate(value, field):
    """
    Nudge a gas trend slowly toward its ceiling. Slows as it approaches the
    ceiling so it plateaus instead of clipping hard.
    """
    cfg = ACCUMULATION[field]
    remaining = max(0.0, cfg["ceiling"] - value)
    step = cfg["rate"] * (remaining / cfg["ceiling"])
    return round(min(cfg["ceiling"], value + step), 3)


def new_state():
    """Fresh per-miner state: baseline values + hidden trend/phase bookkeeping."""
    s = dict(BASELINE)
    s["co_trend"] = BASELINE["co_ppm"]
    s["ch4_trend"] = BASELINE["ch4_pct"]
    s["phase"] = "normal"          # normal | strain | hit
    s["impact_pending"] = False    # emit the impact spike on the next packet
    s["panic_pending"] = False     # Day 10: emit panic=True on the next packet only
    return s


def set_phase(state, phase):
    """Switch a miner into a casualty phase (called by the demo script)."""
    if phase not in ("normal", "strain", "hit"):
        raise ValueError(f"unknown phase: {phase}")
    state["phase"] = phase
    state["impact_pending"] = phase == "hit"


def trigger_panic(state):
    """
    Day 10: simulate a worker pressing the panic button.

    Unlike a phase (which persists tick-to-tick), a button press is a
    single momentary event - it does NOT change `phase`, doesn't touch
    vitals or motion, and only shows up as panic=True on the very next
    packet built for this miner. The triage engine is what latches it
    into a standing Red; the simulator's job is just to report the press
    once, honestly, like a real device would.
    """
    state["panic_pending"] = True


# --- Packet builder -------------------------------------------------------

def build_packet(worker_id, pos, state, profile, ts=None):
    """Advance one miner by one tick and return the raw packet (no triage tier yet)."""
    phase = state["phase"]

    # motion: light shift motion, unless this is the impact tick
    motion_g = round(random.uniform(0.0, 1.5), 2)
    hit_tick = state["impact_pending"]
    if hit_tick:
        motion_g = round(random.uniform(*IMPACT_RANGE), 2)
        state["impact_pending"] = False

    # Day 10: one-shot panic flag - consumed here regardless of phase
    panic_tick = state["panic_pending"]
    state["panic_pending"] = False

    # vitals
    if phase == "normal":
        state["hr"] = settle(state["hr"], BASELINE["hr"], 2, 0.1, 60, 110)
        state["spo2"] = settle(state["spo2"], BASELINE["spo2"], 0.5, 0.15, 90, 100)
    elif not hit_tick:
        # on the impact tick vitals hold; they crash from the NEXT tick,
        # so the packet stream shows impact first, crash after (like a real hit)
        tgt = CASUALTY_TARGETS[phase]
        pull = 0.5 if phase == "hit" else CASUALTY_PULL
        state["hr"] = approach(state["hr"], tgt["hr"], pull, 1.0, 30, 200)
        state["spo2"] = approach(state["spo2"], tgt["spo2"], pull, 0.3, 60, 100)

    # environment
    state["ambient_temp_c"] = settle(state["ambient_temp_c"], BASELINE["ambient_temp_c"], 0.3, 0.05, 20, 45)
    state["seismic_reading"] = settle(state["seismic_reading"], BASELINE["seismic_reading"], 0.01, 0.2, 0, 5)
    state["o2_pct"] = settle(state["o2_pct"], BASELINE["o2_pct"], 0.1, 0.1, 15, 21)
    state["battery_pct"] = max(0, state["battery_pct"] - 0.05)  # slow drain

    # gas
    if profile == "accumulating":
        state["co_trend"] = accumulate(state["co_trend"], "co_ppm")
        state["ch4_trend"] = accumulate(state["ch4_trend"], "ch4_pct")
        n = ACCUM_NOISE
        state["co_ppm"] = round(max(0, state["co_trend"] + random.uniform(-n["co_ppm"], n["co_ppm"])), 2)
        state["ch4_pct"] = round(max(0, state["ch4_trend"] + random.uniform(-n["ch4_pct"], n["ch4_pct"])), 2)
    else:
        state["co_ppm"] = settle(state["co_ppm"], BASELINE["co_ppm"], 1, 0.1, 0, 200)
        state["ch4_pct"] = settle(state["ch4_pct"], BASELINE["ch4_pct"], 0.02, 0.1, 0, 5)

    return {
        "worker_id": worker_id,
        "domain": "miner",
        "ts": int(time.time()) if ts is None else ts,
        "hr": int(state["hr"]),
        "spo2": int(state["spo2"]),
        "motion_g": motion_g,
        "pos_x": pos[0],
        "pos_y": pos[1],
        "pos_z": pos[2],
        "battery_pct": round(state["battery_pct"], 1),
        "comms_status": "ok",
        "co_ppm": int(state["co_ppm"]),
        "ch4_pct": state["ch4_pct"],
        "o2_pct": state["o2_pct"],
        "ambient_temp_c": state["ambient_temp_c"],
        "seismic_reading": state["seismic_reading"],
        "self_rescuer_status": "stowed",
        "panic": panic_tick,
        "triage_tier": "green",  # overwritten by the triage engine before emitting
    }


# --- Output ---------------------------------------------------------------

class Emitter:
    """
    Prints every packet as a JSON line on stdout and, if a URL is given,
    also sends it as one text message per packet over a WebSocket.
    A missing library or dead server never stops the simulator: it warns
    once, keeps printing, and retries the connection every few seconds.
    """

    RETRY_SECONDS = 5

    def __init__(self, ws_url=None):
        self.ws_url = ws_url
        self.ws = None
        self._next_try = 0.0
        self._warned = False
        self._lib_missing = False

    def _connect(self):
        try:
            from websockets.sync.client import connect
        except ImportError:
            if not self._lib_missing:
                print("[ws] 'websockets' not installed (pip install websockets) - stdout only", file=sys.stderr)
            self._lib_missing = True
            return
        try:
            self.ws = connect(self.ws_url, open_timeout=2)
            print(f"[ws] connected to {self.ws_url}", file=sys.stderr)
            self._warned = False
        except Exception as e:
            self.ws = None
            if not self._warned:
                print(f"[ws] cannot reach {self.ws_url} ({e.__class__.__name__}) - will keep retrying", file=sys.stderr)
                self._warned = True

    def send(self, packet):
        line = json.dumps(packet)
        print(line, flush=True)
        if not self.ws_url or self._lib_missing:
            return
        if self.ws is None and time.time() >= self._next_try:
            self._connect()
            self._next_try = time.time() + self.RETRY_SECONDS
        if self.ws is not None:
            try:
                self.ws.send(line)
            except Exception:
                print("[ws] connection lost - will retry", file=sys.stderr)
                self.ws = None

    def close(self):
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:
                pass


# --- Main loop --------------------------------------------------------------

def run(interval, demo, ws_url, seed):
    if seed is not None:
        random.seed(seed)

    states = {wid: new_state() for wid in MINERS}
    engine = TriageEngine()
    emitter = Emitter(ws_url)
    script = sorted(DEMO_SCRIPT) if demo else []
    last_tier = {}
    start = time.time()

    print(f"Mine simulator started for {len(MINERS)} miners: {', '.join(MINERS)} - Ctrl+C to stop", file=sys.stderr)
    print(f"Ventilation profiles: {VENTILATION_PROFILE}", file=sys.stderr)
    if demo:
        print(f"Demo script (s, miner, phase): {script}", file=sys.stderr)
    print(file=sys.stderr)

    try:
        while True:
            elapsed = time.time() - start
            while script and script[0][0] <= elapsed:
                _, wid, phase = script.pop(0)
                set_phase(states[wid], phase)
                print(f"[demo] t={elapsed:.0f}s {wid} -> phase '{phase}'", file=sys.stderr)

            for wid, pos in MINERS.items():
                profile = VENTILATION_PROFILE.get(wid, "steady")
                packet = build_packet(wid, pos, states[wid], profile)
                result = engine.evaluate(packet)
                packet["triage_tier"] = result.tier
                emitter.send(packet)

                if result.tier != last_tier.get(wid, "green"):
                    print(f"[triage] {wid}: {last_tier.get(wid, 'green')} -> {result.tier}  ({'; '.join(result.reasons)})", file=sys.stderr)
                last_tier[wid] = result.tier

            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nSimulator stopped.", file=sys.stderr)
    finally:
        emitter.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Sanjeevani mine telemetry simulator")
    ap.add_argument("--demo", action="store_true", help="run the scripted M07 casualty (normal -> yellow -> red)")
    ap.add_argument("--ws", metavar="URL", help="also send each packet to this WebSocket, e.g. ws://localhost:8765")
    ap.add_argument("--interval", type=float, default=INTERVAL_SECONDS, help="seconds between packet rounds")
    ap.add_argument("--seed", type=int, help="random seed for reproducible runs")
    args = ap.parse_args()
    run(args.interval, args.demo, args.ws, args.seed)
