import random
from triage import TriageEngine, GREEN, YELLOW, RED
import mine_simulator as sim

M = sim.MINERS["M07"]

def build(st, ts, wid="M07"):
    return sim.build_packet(wid, M, st, "steady", ts=ts)

# --- interval-scaled dropout thresholds ---------------------------------

def test_default_interval_keeps_default_thresholds():
    t = sim.signal_thresholds(3)
    assert t == {"signal_stale_s": 7, "signal_lost_s": 12}

def test_fast_interval_never_goes_below_defaults():
    t = sim.signal_thresholds(0.5)
    assert t == {"signal_stale_s": 7, "signal_lost_s": 12}

def test_slow_interval_scales_thresholds():
    t = sim.signal_thresholds(10)
    assert t["signal_stale_s"] == 21 and t["signal_lost_s"] == 40

def test_slow_interval_does_not_false_alarm():
    e = TriageEngine(sim.signal_thresholds(10))
    st = sim.new_state()
    for k in range(20):
        e.evaluate(build(st, k * 10))
        # check just before the NEXT packet is due
        assert e.signal_status("M07", k * 10 + 9)["status"] == "ok"

def test_slow_interval_would_false_alarm_with_default_thresholds():
    e = TriageEngine()      # documents the bug that was fixed
    e.evaluate(pkt := build(sim.new_state(), 0))
    assert e.signal_status("M07", 9)["status"] == "stale"

def test_real_dropout_still_detected_at_slow_interval():
    e = TriageEngine(sim.signal_thresholds(10))
    e.evaluate(build(sim.new_state(), 0))
    assert e.signal_status("M07", 40)["status"] == "lost"

# --- impact spike buffered through a dropout -----------------------------

def dark_hit(seed=1, dark_ticks=6):
    random.seed(seed)
    st, e = sim.new_state(), TriageEngine()
    ts = 0
    for _ in range(3):
        e.evaluate(build(st, ts)); ts += 3
    sim.start_dropout(st)
    sim.set_phase(st, "hit")
    for _ in range(dark_ticks):
        build(st, ts); ts += 3            # discarded: device is dark
    sim.end_dropout(st)
    return st, e, ts

def test_hit_during_dropout_goes_red_on_reconnect():
    for seed in range(30):
        st, e, ts = dark_hit(seed)
        r = e.evaluate(build(st, ts))
        assert r.tier == RED, f"seed {seed}"
        assert r.reconnected_after_s is not None

def test_buffered_impact_delivered_once():
    st, e, ts = dark_hit()
    p1 = build(st, ts)
    assert p1["motion_g"] >= sim.IMPACT_RANGE[0]
    p2 = build(st, ts + 3)
    assert p2["motion_g"] <= 1.5

def test_buffered_impact_keeps_the_peak():
    st = sim.new_state()
    sim.start_dropout(st)
    for g in (5.6, 7.9, 6.0):
        st["impact_pending"] = True
        random.seed(0)
        build(st, 0)
    assert st["buffered_impact_g"] >= sim.IMPACT_RANGE[0]

def test_light_motion_while_dark_is_not_buffered():
    random.seed(3)
    st = sim.new_state()
    sim.start_dropout(st)
    for k in range(20):
        build(st, k)
    assert st["buffered_impact_g"] == 0.0

def test_no_dropout_no_change_in_impact_path():
    st = sim.new_state()
    sim.set_phase(st, "hit")
    p = build(st, 0)
    assert p["motion_g"] >= sim.IMPACT_RANGE[0]
    assert "panic_ts" not in p

# --- panic press buffered through a dropout --------------------------------

def test_panic_during_dropout_delivered_with_press_time():
    st = sim.new_state()
    e = TriageEngine()
    e.evaluate(build(st, 0))
    sim.start_dropout(st)
    sim.trigger_panic(st)
    build(st, 30)                          # press happens at ts=30, device dark
    build(st, 33)
    sim.end_dropout(st)
    p = build(st, 60)
    assert p["panic"] is True and p["panic_ts"] == 30
    r = e.evaluate(p)
    assert r.tier == RED and r.manual_trigger is True
    assert r.since_hit_s == 30             # counted from the press, not reconnect
    p2 = build(st, 63)
    assert p2["panic"] is False and "panic_ts" not in p2

def test_first_of_two_dark_presses_wins():
    st = sim.new_state()
    sim.start_dropout(st)
    sim.trigger_panic(st); build(st, 10)
    sim.trigger_panic(st); build(st, 20)
    sim.end_dropout(st)
    assert build(st, 30)["panic_ts"] == 10

def test_live_panic_has_no_panic_ts():
    st = sim.new_state()
    sim.trigger_panic(st)
    p = build(st, 5)
    assert p["panic"] is True and "panic_ts" not in p

def test_triage_panic_ts_never_in_the_future():
    e = TriageEngine()
    r = e.evaluate({"worker_id": "M07", "ts": 10, "hr": 85, "spo2": 98,
                    "motion_g": 0.5, "panic": True, "panic_ts": 99})
    assert r.since_hit_s == 0

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
