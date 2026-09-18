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

Day 9: "since hit" timer and HR/SpO2 trend arrows.

  since_hit_s   seconds since hit_ts, on every RED result (fresh or
                latched). None when the worker isn't red.
  hr_trend      "rising" / "falling" / "steady", comparing this packet's HR
  spo2_trend    to the previous packet's HR/SpO2 for that worker. A small
                dead-band (*_trend_delta) keeps normal packet-to-packet
                noise from flipping the arrow back and forth. None on a
                worker's first packet (nothing to compare against yet) or
                when the field is missing from the packet.

  Trends are computed on EVERY packet regardless of tier - a rising HR is
  useful to see before someone even reaches yellow, not just during a
  casualty.

Day 10: manual panic-button trigger. A `panic` (or `panic_button`) truthy
field on the packet forces Red immediately - no impact, no crash, no
IMPACT_WINDOW_S needed. This models the worker/soldier consciously hitting
a distress button rather than the system inferring a casualty from vitals.
It still latches like any other Red, and injury-pattern classification
still runs against whatever vitals happen to be in that packet (so a panic
press accompanied by a real crash still gets a real hint) - it just
doesn't require them. `TriageResult.manual_trigger` is True for the
lifetime of a Red that was (at least partly) declared this way, so the UI
can show "SOS pressed" distinctly from an auto-detected casualty.

Day 11: signal dropout. A worker who stops sending packets is NOT a tier -
silence says nothing about their vitals, so it must never turn a pin green
or red by itself. It is a separate signal-health axis, reported alongside
the tier:

  signal_status(worker_id, now)   -> {"status", "silent_for_s",
                                      "last_seen_ts", "last_tier"}
      status  "ok"      packet seen recently
              "stale"   silent >= signal_stale_s   (map: dim / "?" badge)
              "lost"    silent >= signal_lost_s    (map: grey, "last known")
              "unknown" never heard from this worker
      last_tier is the tier of the LAST packet received, so the UI can say
      "signal lost - last known RED" (a latched Red stays Red on dropout).
  TriageResult.reconnected_after_s  set on the first packet after a gap of
      >= signal_lost_s (seconds of silence), else None.

Day 13: an optional `panic_ts` on the packet (set by a device that buffered
the press while offline) is used as hit_ts for a panic-only Red.

The engine has no clock (still pure logic): the caller passes `now`, using
the same time base as packet["ts"].
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
    "shock_hr": 120,         # bpm, >= this WITH an SpO2 crash reads as shock, not breathing (Day 12)
    # --- yellow: gas (mine domain) ---
    "co_ppm": 35,            # ppm, >= this
    "ch4_pct": 1.0,          # %,   >= this
    "o2_pct_low": 19.5,      # %,   <  this
    # --- Day 8: blast pattern ---
    "blast_impact_g": 7.5,   # g, well above a normal stumble/hit spike
    "blast_seismic": 0.5,    # seismic reading, baseline noise is ~0.01-0.03
    # --- Day 9: trend dead-band ---
    "hr_trend_delta": 3,     # bpm change between consecutive packets to call it rising/falling
    "spo2_trend_delta": 1,   # %   change between consecutive packets to call it rising/falling
    # --- Day 11: signal dropout (packets normally arrive every ~3 s) ---
    "signal_stale_s": 7,     # s of silence -> "stale"  (~2 missed packets)
    "signal_lost_s": 12,     # s of silence -> "lost"   (~4 missed packets)
}


@dataclass
class TriageResult:
    tier: str
    reasons: list = field(default_factory=list)
    injury_hint: str = None    # only set on RED; see module docstring
    since_hit_s: int = None    # only set on RED; see module docstring
    hr_trend: str = None       # "rising" / "falling" / "steady" / None
    spo2_trend: str = None     # "rising" / "falling" / "steady" / None
    manual_trigger: bool = False   # True if (any part of) this RED came from the panic button
    reconnected_after_s: int = None  # Day 11: silence length if this packet ends a "lost" gap


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
            # Day 12: Red latches on the FIRST tick a crash is seen, when HR is
            # often still climbing (e.g. 138, just under crash_hr_high). An
            # SpO2 crash with HR already tachycardic (>= shock_hr) is still the
            # shock signature. Requiring the SpO2 crash keeps a panic press on
            # a merely-strained worker (HR 130, SpO2 ok) as "unspecified".
            if hr is not None and hr >= t["shock_hr"]:
                return BLEEDING_SHOCK
            # SpO2 crashed without a compensatory tachycardia (HR normal,
            # or even crashed low/bradycardic) - airway/oxygen problem.
            return BREATHING
        return UNSPECIFIED

    def _trend(self, current, previous, delta):
        """Day 9: rising/falling/steady, with a dead-band to kill noise flicker."""
        if current is None or previous is None:
            return None
        diff = current - previous
        if abs(diff) < delta:
            return "steady"
        return "rising" if diff > 0 else "falling"

    def evaluate(self, packet):
        """Classify one packet. Returns a TriageResult (also records signal health)."""
        wid = _first(packet, "worker_id", "id")
        ts = packet["ts"]
        prev_seen = self._state.get(wid, {}).get("last_seen_ts")

        result = self._evaluate(packet)

        st = self._state[wid]
        if prev_seen is not None and ts - prev_seen >= self.t["signal_lost_s"]:
            result.reconnected_after_s = ts - prev_seen
        st["last_seen_ts"] = ts if prev_seen is None else max(prev_seen, ts)
        st["last_tier"] = result.tier
        return result

    def signal_status(self, worker_id, now):
        """Day 11: how long has this worker been silent? See module docstring."""
        st = self._state.get(worker_id)
        if not st or st["last_seen_ts"] is None:
            return {"status": "unknown", "silent_for_s": None,
                    "last_seen_ts": None, "last_tier": None}
        silent = max(0, now - st["last_seen_ts"])
        if silent >= self.t["signal_lost_s"]:
            status = "lost"
        elif silent >= self.t["signal_stale_s"]:
            status = "stale"
        else:
            status = "ok"
        return {"status": status, "silent_for_s": silent,
                "last_seen_ts": st["last_seen_ts"], "last_tier": st["last_tier"]}

    def _evaluate(self, packet):
        wid = _first(packet, "worker_id", "id")
        ts = packet["ts"]
        st = self._state.setdefault(
            wid, {
                "last_impact_ts": None, "last_impact_g": None,
                "red": False, "hit_ts": None, "injury_hint": None,
                "prev_hr": None, "prev_spo2": None, "manual_trigger": False,
                "last_seen_ts": None, "last_tier": None,
            }
        )
        t = self.t

        hr = _first(packet, "hr")
        spo2 = _first(packet, "spo2")
        impact = _first(packet, "motion_g", "impact_g")
        panic = bool(_first(packet, "panic", "panic_button"))

        # Day 9: trend vs the PREVIOUS packet, before we overwrite prev_* below.
        hr_trend = self._trend(hr, st["prev_hr"], t["hr_trend_delta"])
        spo2_trend = self._trend(spo2, st["prev_spo2"], t["spo2_trend_delta"])
        if hr is not None:
            st["prev_hr"] = hr
        if spo2 is not None:
            st["prev_spo2"] = spo2

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

        # 3. RED: latched, or impact + crash together, or the panic button
        if st["red"]:
            return TriageResult(
                RED,
                [f"latched since ts={st['hit_ts']} (reset() to clear)"],
                injury_hint=st["injury_hint"],
                since_hit_s=ts - st["hit_ts"],
                hr_trend=hr_trend,
                spo2_trend=spo2_trend,
                manual_trigger=st["manual_trigger"],
            )
        auto_trigger = recent_impact and crash
        if auto_trigger or panic:
            st["red"] = True
            # Day 13: a press buffered during a dropout carries panic_ts (when it
            # really happened) so since_hit_s counts from the press.
            panic_ts = _first(packet, "panic_ts")
            st["hit_ts"] = (
                st["last_impact_ts"] if auto_trigger
                else (min(panic_ts, ts) if panic_ts is not None else ts)
            )
            st["manual_trigger"] = panic
            hint = self._classify_pattern(packet, st["last_impact_g"], hr, crash)
            st["injury_hint"] = hint
            reasons = []
            if panic:
                reasons.append("manual panic button pressed")
            if auto_trigger:
                reasons.append(f"impact {st['last_impact_g']} g within {t['impact_window_s']}s")
                reasons.extend(crash)
            return TriageResult(
                RED,
                reasons,
                injury_hint=hint,
                since_hit_s=ts - st["hit_ts"],
                hr_trend=hr_trend,
                spo2_trend=spo2_trend,
                manual_trigger=panic,
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
            return TriageResult(YELLOW, why, hr_trend=hr_trend, spo2_trend=spo2_trend)

        return TriageResult(GREEN, [], hr_trend=hr_trend, spo2_trend=spo2_trend)

    def reset(self, worker_id=None):
        """Clear latched Red / impact memory for one worker, or everyone."""
        if worker_id is None:
            self._state.clear()
        else:
            self._state.pop(worker_id, None)

    def worker_state(self, worker_id):
        """Copy of the per-worker state (hit_ts is what Day 9's 'since hit' timer needs)."""
        return dict(self._state.get(worker_id, {}))
