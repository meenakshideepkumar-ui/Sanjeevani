"""
Sanjeevani - Triage Rules Engine (krishna/)

Turns a raw telemetry packet into a triage tier: green / yellow / red.
Pure logic - no I/O, no randomness - so the simulator, the server and the
tests can all import it and get identical answers.

Rules (all thresholds live in THRESHOLDS so Day 12 tuning is one place):

  RED     an impact spike AND a vitals crash together.
          "Together" = the vitals crash is seen within IMPACT_WINDOW_S
          seconds of the impact (the crash follows the hit by a few seconds,
          it is not in the same packet). Red is LATCHED: once a casualty is
          declared it stays red until reset() (someone acknowledged it), so a
          pin never flickers back to green while a person is down.

  YELLOW  any single warning sign:
            - HR too high / too low
            - SpO2 low
            - an impact spike on its own (a stumble / knock) - held for the
              same window, then it clears if vitals stay normal
            - hazardous gas (CO / CH4 high, O2 low) - mine domain only

  GREEN   none of the above.

Why "impact AND crash" for Red: either signal alone is common and harmless
(a stumble spikes impact; a sprint spikes HR). A real casualty shows both.
That is also the false-positive guard for the Day 15 stumble-vs-casualty check.

Field names: accepts the mine-domain packet (worker_id / motion_g) and the
protocol.md v0 draft names (id / impact_g). Missing fields are skipped, not
treated as errors.

Day 8: injury-pattern hint. Once a casualty goes Red, guess *what kind* of
casualty it is from the same packet fields, so the UI/report can say more
than just "red":

  bleeding_shock  HR crashed HIGH (compensatory tachycardia) - classic
                  blood-loss/shock signature.
  breathing       SpO2 crashed but HR did NOT spike high (normal or even
                  crashed low) - points at an airway/oxygen problem, not
                  blood loss.
  blast           the impact itself is far above a normal stumble/hit AND
                  the seismic reading spiked at the same time - a
                  structural/explosive event, not a fall.
  unspecified     Red fired (e.g. from the latch) without enough signal to
                  tell these apart.

The hint is decided ONCE, at the moment Red is first declared, and kept in
the latched state - vitals drift back toward baseline while latched, so
recomputing every packet would make the hint flicker.
"""

from dataclasses import dataclass, field

GREEN, YELLOW, RED = "green", "yellow", "red"

BLEEDING_SHOCK, BREATHING, BLAST, UNSPECIFIED = (
    "bleeding_shock", "breathing", "blast", "unspecified",
)

THRESHOLDS = {
    # --- yellow: vitals ---
    "hr_high": 120,          # bpm, >= this
    "hr_low": 55,            # bpm, <= this
    "spo2_low": 93,          # %,   <= this
    # --- impact ---
    "impact_g": 4.0,         # g, >= this counts as an impact spike
    "impact_window_s": 15,   # seconds an impact stays "recent"
    # --- red: vitals crash (only counts if an impact is recent) ---
    "crash_spo2": 89,        # %,   <= this
    "crash_hr_high": 140,    # bpm, >= this (shock-type tachycardia)
    "crash_hr_low": 45,      # bpm, <= this
    # --- yellow: gas (mine domain) ---
    "co_ppm": 35,            # ppm, >= this
    "ch4_pct": 1.0,          # %,   >= this
    "o2_pct_low": 19.5,      # %,   <  this
    # --- Day 8: blast pattern ---
    "blast_impact_g": 7.5,   # g, well above a normal stumble/hit spike
    "blast_seismic": 0.5,    # seismic reading, baseline noise is ~0.01-0.03
}


@dataclass
class TriageResult:
    tier: str
    reasons: list = field(default_factory=list)
    injury_hint: str = None    # only set on RED; see module docstring


def _first(packet, *keys):
    """Value of the first key present in the packet, else None (0.0 is valid)."""
    for k in keys:
        if k in packet and packet[k] is not None:
            return packet[k]
    return None


class TriageEngine:
    """Stateful per worker: remembers the last impact and any latched Red."""

    def __init__(self, thresholds=None):
        self.t = dict(THRESHOLDS)
        if thresholds:
            self.t.update(thresholds)
        self._state = {}

    # -- public API ---------------------------------------------------

    def _classify_pattern(self, packet, impact_g, hr, crash):
        """Day 8: decide what kind of casualty this Red is, from this one packet."""
        t = self.t
        seismic = _first(packet, "seismic_reading")

        if (
            impact_g is not None and impact_g >= t["blast_impact_g"]
            and seismic is not None and seismic >= t["blast_seismic"]
        ):
            return BLAST

        crashed_high = hr is not None and hr >= t["crash_hr_high"]
        crashed_low_spo2 = any("SpO2" in c for c in crash)

        if crashed_high:
            return BLEEDING_SHOCK
        if crashed_low_spo2:
            # SpO2 crashed without a compensatory tachycardia (HR normal,
            # or even crashed low/bradycardic) - airway/oxygen problem.
            return BREATHING
        return UNSPECIFIED

    def evaluate(self, packet):
        """Classify one packet. Returns TriageResult(tier, reasons, injury_hint)."""
        wid = _first(packet, "worker_id", "id")
        ts = packet["ts"]
        st = self._state.setdefault(
            wid, {
                "last_impact_ts": None, "last_impact_g": None,
                "red": False, "hit_ts": None, "injury_hint": None,
            }
        )
        t = self.t

        hr = _first(packet, "hr")
        spo2 = _first(packet, "spo2")
        impact = _first(packet, "motion_g", "impact_g")

        # 1. track impacts
        if impact is not None and impact >= t["impact_g"]:
            st["last_impact_ts"] = ts
            st["last_impact_g"] = impact
        recent_impact = (
            st["last_impact_ts"] is not None
            and ts - st["last_impact_ts"] <= t["impact_window_s"]
        )

        # 2. vitals crash?
        crash = []
        if spo2 is not None and spo2 <= t["crash_spo2"]:
            crash.append(f"SpO2 {spo2} <= {t['crash_spo2']}")
        if hr is not None and hr >= t["crash_hr_high"]:
            crash.append(f"HR {hr} >= {t['crash_hr_high']}")
        if hr is not None and hr <= t["crash_hr_low"]:
            crash.append(f"HR {hr} <= {t['crash_hr_low']}")

        # 3. RED: latched, or impact + crash together
        if st["red"]:
            return TriageResult(
                RED,
                [f"latched since ts={st['hit_ts']} (reset() to clear)"],
                injury_hint=st["injury_hint"],
            )
        if recent_impact and crash:
            st["red"] = True
            st["hit_ts"] = st["last_impact_ts"]
            hint = self._classify_pattern(packet, st["last_impact_g"], hr, crash)
            st["injury_hint"] = hint
            return TriageResult(
                RED,
                [f"impact {st['last_impact_g']} g within {t['impact_window_s']}s"] + crash,
                injury_hint=hint,
            )

        # 4. YELLOW: any single warning sign
        why = []
        if hr is not None and hr >= t["hr_high"]:
            why.append(f"HR {hr} >= {t['hr_high']}")
        if hr is not None and hr <= t["hr_low"]:
            why.append(f"HR {hr} <= {t['hr_low']}")
        if spo2 is not None and spo2 <= t["spo2_low"]:
            why.append(f"SpO2 {spo2} <= {t['spo2_low']}")
        if recent_impact:
            why.append(f"impact >= {t['impact_g']} g in last {t['impact_window_s']}s (vitals ok)")
        co = _first(packet, "co_ppm")
        ch4 = _first(packet, "ch4_pct")
        o2 = _first(packet, "o2_pct")
        if co is not None and co >= t["co_ppm"]:
            why.append(f"CO {co} ppm >= {t['co_ppm']}")
        if ch4 is not None and ch4 >= t["ch4_pct"]:
            why.append(f"CH4 {ch4}% >= {t['ch4_pct']}")
        if o2 is not None and o2 < t["o2_pct_low"]:
            why.append(f"O2 {o2}% < {t['o2_pct_low']}")
        if why:
            return TriageResult(YELLOW, why)

        return TriageResult(GREEN, [])

    def reset(self, worker_id=None):
        """Clear latched Red / impact memory for one worker, or everyone."""
        if worker_id is None:
            self._state.clear()
        else:
            self._state.pop(worker_id, None)

    def worker_state(self, worker_id):
        """Copy of the per-worker state (hit_ts is what Day 9's 'since hit' timer needs)."""
        return dict(self._state.get(worker_id, {}))
