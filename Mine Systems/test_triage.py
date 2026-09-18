"""
Tests for triage.py and the Day 7 simulator.
Run with:  python test_triage.py      (or: pytest test_triage.py)
"""

import random

import mine_simulator as sim
from triage import GREEN, YELLOW, RED, TriageEngine


def pkt(ts, hr=85, spo2=98, g=0.5, wid="M07", **extra):
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2, "motion_g": g}
    p.update(extra)
    return p


# --- Green / Yellow -----------------------------------------------------

def test_normal_is_green():
    assert TriageEngine().evaluate(pkt(0)).tier == GREEN


def test_high_hr_yellow():
    assert TriageEngine().evaluate(pkt(0, hr=125)).tier == YELLOW


def test_low_spo2_yellow():
    assert TriageEngine().evaluate(pkt(0, spo2=92)).tier == YELLOW


def test_gas_yellow():
    e = TriageEngine()
    assert e.evaluate(pkt(0, co_ppm=40)).tier == YELLOW
    assert e.evaluate(pkt(3, ch4_pct=1.2)).tier == YELLOW
    assert e.evaluate(pkt(6, o2_pct=19.0)).tier == YELLOW
    assert e.evaluate(pkt(9, co_ppm=5, ch4_pct=0.1, o2_pct=20.9)).tier == GREEN


# --- Red ------------------------------------------------------------------

def test_stumble_is_not_red():
    """Impact alone with normal vitals: yellow for the window, then clears."""
    e = TriageEngine()
    assert e.evaluate(pkt(0, g=6.0)).tier == YELLOW
    assert e.evaluate(pkt(3)).tier == YELLOW
    assert e.evaluate(pkt(30)).tier == GREEN


def test_crash_without_impact_is_not_red():
    r = TriageEngine().evaluate(pkt(0, hr=150, spo2=80))
    assert r.tier == YELLOW


def test_impact_plus_crash_same_packet_is_red():
    assert TriageEngine().evaluate(pkt(0, g=7.0, hr=150, spo2=84)).tier == RED


def test_crash_shortly_after_impact_is_red():
    e = TriageEngine()
    assert e.evaluate(pkt(0, g=7.0)).tier == YELLOW
    assert e.evaluate(pkt(6, spo2=85)).tier == RED


def test_crash_too_long_after_impact_is_not_red():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    assert e.evaluate(pkt(20, spo2=85)).tier == YELLOW


def test_red_latches_until_reset():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0, hr=150, spo2=84))
    assert e.evaluate(pkt(60)).tier == RED          # vitals fully recovered, still red
    assert e.worker_state("M07")["hit_ts"] == 0
    e.reset("M07")
    assert e.evaluate(pkt(63)).tier == GREEN


def test_workers_are_independent():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0, hr=150, spo2=84, wid="M07"))
    assert e.evaluate(pkt(0, wid="M08")).tier == GREEN


def test_protocol_v0_field_names_work():
    """protocol.md v0 draft uses id / impact_g."""
    p = {"id": "S07", "hr": 150, "spo2": 84, "impact_g": 7.0, "ts": 1753500000}
    assert TriageEngine().evaluate(p).tier == RED


# --- Simulator end to end (headless) --------------------------------------

def run_headless(ticks, seed, script):
    """script: {tick_number: (worker, phase)}; returns {worker: [tier per tick]}."""
    random.seed(seed)
    states = {w: sim.new_state() for w in sim.MINERS}
    engine = TriageEngine()
    tiers = {w: [] for w in sim.MINERS}
    for i in range(ticks):
        if i in script:
            w, phase = script[i]
            sim.set_phase(states[w], phase)
        ts = 1_000_000 + i * 3
        for w, pos in sim.MINERS.items():
            p = sim.build_packet(w, pos, states[w], sim.VENTILATION_PROFILE[w], ts=ts)
            tiers[w].append(engine.evaluate(p).tier)
    return tiers


def test_healthy_miners_never_false_alarm():
    """~2 hours of sim time, 5 seeds: M07/M08 (steady) must stay green throughout."""
    for seed in range(5):
        t = run_headless(2400, seed, {})
        assert set(t["M07"]) == {GREEN}, f"seed {seed}: M07 left green"
        assert set(t["M08"]) == {GREEN}, f"seed {seed}: M08 left green"


def test_accumulating_miner_eventually_yellow_never_red():
    t = run_headless(600, 1, {})
    assert t["M09"][0] == GREEN
    assert YELLOW in t["M09"] and RED not in t["M09"]


def test_scripted_casualty_goes_green_yellow_red():
    for seed in range(5):
        t = run_headless(60, seed, {5: ("M07", "strain"), 12: ("M07", "hit")})["M07"]
        first = lambda tier: t.index(tier)
        assert t[0] == GREEN
        assert first(GREEN) < first(YELLOW) < first(RED), f"seed {seed}: {t}"
        assert t[12] == YELLOW, "impact tick alone should still be yellow"
        assert t[-1] == RED
        others = run_headless(60, seed, {5: ("M07", "strain"), 12: ("M07", "hit")})
        assert set(others["M08"]) == {GREEN}


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except AssertionError as ex:
            failed += 1
            print(f"FAIL  {name}: {ex}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
