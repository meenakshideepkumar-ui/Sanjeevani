"""
Sanjeevani - Day 15 edge-case pass (krishna/)

Two jobs from the schedule:
  1. false-positive check: a stumble must not become a casualty
  2. simultaneous multi-casualty events

Same self-running style as test_day14.py: python test_day15.py
"""

import json, random
from triage import (TriageEngine, GREEN, YELLOW, RED,
                    BLEEDING_SHOCK, BREATHING, BLAST, UNSPECIFIED, THRESHOLDS)
import mine_simulator as sim

M = sim.MINERS["M07"]


def step(st, eng, ts, wid="M07", pos=None):
    p = sim.build_packet(wid, pos or M, st, "steady", ts=ts)
    r = eng.evaluate(p)
    return sim.attach_triage(p, r), r


def feed(eng, wid, ts, hr, spo2, motion_g, **extra):
    """Hand-built packet, for pinning down one specific vitals path."""
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2,
         "motion_g": motion_g, **extra}
    return eng.evaluate(p)


# --- 1. false positives: stumble vs real casualty ---------------------------

def test_simulator_can_produce_a_stumble():
    """The impact has to actually clear the threshold, or the test below proves nothing."""
    random.seed(20)
    st = sim.new_state()
    sim.trigger_stumble(st)
    p = sim.build_packet("M07", M, st, "steady", ts=0)
    assert p["motion_g"] >= THRESHOLDS["impact_g"], p["motion_g"]
    assert st["phase"] == "normal"          # a knock is not a casualty phase
    assert st["stumble_pending"] is False   # one-shot, consumed


def test_stumble_alone_is_yellow_then_clears_to_green():
    random.seed(21)
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    sim.trigger_stumble(st)
    tiers = [step(st, e, k * 3)[1].tier for k in range(1, 10)]
    assert tiers[0] == YELLOW, tiers
    assert RED not in tiers, tiers
    assert tiers[-1] == GREEN, tiers   # window expires on its own


def test_stumble_then_sprint_is_not_a_casualty():
    """The Day 15 headline case: knock, then HR climbs on its own. SpO2 never moves."""
    e = TriageEngine()
    feed(e, "X", 0, 90, 98, 0.5)
    feed(e, "X", 3, 100, 97, 5.2)          # the knock
    feed(e, "X", 6, 120, 97, 0.6)
    r = feed(e, "X", 9, 141, 96, 0.6)      # sprinting, oxygen fine
    assert r.tier == YELLOW, (r.tier, r.reasons)
    r = feed(e, "X", 12, 155, 96, 0.6)     # still just working hard
    assert r.tier == YELLOW, (r.tier, r.reasons)


def test_stumble_then_real_bleed_still_goes_red():
    """Same impact, but this time the oxygen line moves with the HR."""
    e = TriageEngine()
    feed(e, "Y", 0, 90, 98, 0.5)
    feed(e, "Y", 3, 100, 97, 5.2)
    r = feed(e, "Y", 9, 141, 91, 0.6)      # HR up AND SpO2 down
    assert r.tier == RED
    assert r.injury_hint == BLEEDING_SHOCK
    assert any("SpO2" in x for x in r.reasons), r.reasons


def test_sustained_tachycardia_without_spo2_drop_stays_yellow():
    """Sustained high HR is what exertion looks like - it is not a route into Red."""
    e = TriageEngine()
    feed(e, "Z", 0, 90, 98, 0.5)
    feed(e, "Z", 3, 100, 97, 5.2)
    for ts, hr in [(6, 145), (9, 147), (12, 150), (15, 152)]:
        r = feed(e, "Z", ts, hr, 97, 0.6)
        assert r.tier == YELLOW, (ts, r.tier, r.reasons)


def test_sustained_flag_shows_in_the_reason_when_red_does_fire():
    e = TriageEngine()
    feed(e, "Z2", 0, 90, 98, 0.5)
    feed(e, "Z2", 3, 145, 97, 5.2)        # high HR, oxygen still fine -> yellow
    r = feed(e, "Z2", 6, 147, 90, 0.6)    # now SpO2 goes with it
    assert r.tier == RED
    assert any("sustained" in x for x in r.reasons), r.reasons


def test_spo2_crash_alone_after_impact_is_unchanged():
    """Day 6 behaviour must survive the Day 15 rule change."""
    e = TriageEngine()
    feed(e, "A", 0, 90, 98, 0.5)
    feed(e, "A", 3, 95, 97, 6.0)
    r = feed(e, "A", 6, 98, 86, 0.5)
    assert r.tier == RED
    assert r.injury_hint == BREATHING     # no compensatory tachycardia


def test_bradycardia_after_impact_is_unchanged():
    e = TriageEngine()
    feed(e, "B", 0, 80, 98, 0.5)
    feed(e, "B", 3, 70, 97, 6.0)
    r = feed(e, "B", 6, 42, 97, 0.5)
    assert r.tier == RED, r.reasons


def test_high_hr_with_no_impact_never_reaches_red():
    """No impact at all: exertion alone is a warning sign, never a casualty."""
    e = TriageEngine()
    for ts, hr in [(0, 100), (3, 145), (6, 150), (9, 160), (12, 165)]:
        r = feed(e, "C", ts, hr, 97, 0.5)
        assert r.tier in (YELLOW, GREEN), (ts, r.tier, r.reasons)


def test_stale_impact_does_not_make_a_panic_press_look_like_a_blast():
    e = TriageEngine()
    feed(e, "D", 0, 90, 98, 7.8, seismic_reading=0.02)      # old knock
    r = e.evaluate({"worker_id": "D", "ts": 600, "hr": 92, "spo2": 98,
                    "motion_g": 0.4, "seismic_reading": 0.9, "panic": True})
    assert r.tier == RED
    assert r.manual_trigger is True
    assert r.injury_hint == UNSPECIFIED, r.injury_hint


def test_genuine_blast_still_classifies_as_blast():
    e = TriageEngine()
    feed(e, "E", 0, 90, 98, 0.5, seismic_reading=0.02)
    r = e.evaluate({"worker_id": "E", "ts": 3, "hr": 150, "spo2": 86,
                    "motion_g": 7.9, "seismic_reading": 0.9})
    assert r.tier == RED
    assert r.injury_hint == BLAST, (r.injury_hint, r.reasons)


# --- 2. simultaneous multi-casualty -----------------------------------------

def test_two_miners_down_together_are_classified_independently():
    random.seed(22)
    eng = TriageEngine()
    sts = {w: sim.new_state() for w in ("M07", "M08")}
    for w in sts:
        sim.set_phase(sts[w], "hit")
    seen = {w: [] for w in sts}
    for k in range(8):
        for w in sts:
            _, r = step(sts[w], eng, k * 3, wid=w, pos=sim.MINERS[w])
            seen[w].append(r.tier)
    for w in sts:
        assert seen[w][-1] == RED, (w, seen[w])
        assert eng.worker_state(w)["injury_hint"] == BLEEDING_SHOCK


def test_one_casualty_does_not_latch_a_healthy_neighbour():
    random.seed(23)
    eng = TriageEngine()
    sts = {w: sim.new_state() for w in ("M07", "M08")}
    sim.set_phase(sts["M07"], "hit")
    for k in range(10):
        for w in sts:
            _, r = step(sts[w], eng, k * 3, wid=w, pos=sim.MINERS[w])
            if w == "M08":
                assert r.tier == GREEN, (k, r.tier, r.reasons)
                assert r.injury_hint is None
    assert eng.worker_state("M07")["red"] is True
    assert eng.worker_state("M08")["red"] is False


def test_reset_clears_one_casualty_and_leaves_the_other_red():
    random.seed(24)
    eng = TriageEngine()
    sts = {w: sim.new_state() for w in ("M07", "M08")}
    for w in sts:
        sim.set_phase(sts[w], "hit")
    for k in range(6):
        for w in sts:
            step(sts[w], eng, k * 3, wid=w, pos=sim.MINERS[w])
    eng.reset("M07")
    sts["M07"]["phase"] = "normal"
    _, r7 = step(sts["M07"], eng, 30, wid="M07", pos=sim.MINERS["M07"])
    _, r8 = step(sts["M08"], eng, 30, wid="M08", pos=sim.MINERS["M08"])
    assert r7.tier != RED, r7.reasons
    assert r8.tier == RED


def test_mixed_panic_and_auto_casualty_keep_their_own_flags():
    random.seed(25)
    eng = TriageEngine()
    sts = {w: sim.new_state() for w in ("M07", "M08")}
    sim.set_phase(sts["M07"], "hit")
    sim.trigger_panic(sts["M08"])
    last = {}
    for k in range(6):
        for w in sts:
            p, r = step(sts[w], eng, k * 3, wid=w, pos=sim.MINERS[w])
            last[w] = (p, r)
    assert last["M07"][1].manual_trigger is False
    assert last["M08"][1].manual_trigger is True
    assert last["M07"][0]["injury_hint"] == BLEEDING_SHOCK
    assert last["M08"][0]["injury_hint"] == UNSPECIFIED


def test_multi_casualty_packets_stay_valid_json_with_no_nulls():
    random.seed(26)
    eng = TriageEngine()
    sts = {w: sim.new_state() for w in sim.MINERS}
    for w in ("M07", "M08"):
        sim.set_phase(sts[w], "hit")
    for k in range(10):
        for w in sim.MINERS:
            p, _ = step(sts[w], eng, k * 3, wid=w, pos=sim.MINERS[w])
            assert None not in p.values(), p
            assert json.loads(json.dumps(p)) == p


# --- 3. the demo scenarios are wired up -------------------------------------

def test_every_scenario_action_is_dispatchable():
    known = {"normal", "strain", "hit"} | set(sim.LINK_ACTIONS) | set(sim.ONE_SHOT_ACTIONS)
    for name, script in sim.DEMO_SCRIPTS.items():
        assert script, name
        for ts, wid, action in script:
            assert wid in sim.MINERS, (name, wid)
            assert action in known, (name, action)


def test_default_scenario_is_the_rehearsed_one():
    assert sim.DEMO_SCRIPT == sim.DEMO_SCRIPTS["casualty"]


tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
failed = 0
for name, fn in tests:
    try:
        fn(); print(f"PASS  {name}")
    except AssertionError as ex:
        failed += 1; print(f"FAIL  {name}: {ex}")
    except Exception as ex:
        failed += 1; print(f"ERROR {name}: {ex.__class__.__name__}: {ex}")
print(f"\n{len(tests)-failed}/{len(tests)} passed")
