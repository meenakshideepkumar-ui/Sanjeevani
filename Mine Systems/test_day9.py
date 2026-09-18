from triage import TriageEngine, GREEN, YELLOW, RED

def pkt(ts, hr=85, spo2=98, g=0.5, wid="M07", **extra):
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2, "motion_g": g}
    p.update(extra)
    return p

# --- since_hit_s -----------------------------------------------------

def test_since_hit_none_when_not_red():
    e = TriageEngine()
    r = e.evaluate(pkt(0))
    assert r.tier == GREEN
    assert r.since_hit_s is None

def test_since_hit_zero_on_fresh_red():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    r = e.evaluate(pkt(6, hr=150, spo2=85))
    assert r.tier == RED
    assert r.since_hit_s == 6  # hit_ts=0 (the impact tick), this packet ts=6

def test_since_hit_grows_while_latched():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    e.evaluate(pkt(6, hr=150, spo2=85))
    r = e.evaluate(pkt(66, hr=85, spo2=98))  # vitals recovered, still latched
    assert r.tier == RED
    assert r.since_hit_s == 66

def test_since_hit_clears_on_reset():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    e.evaluate(pkt(6, hr=150, spo2=85))
    e.reset("M07")
    r = e.evaluate(pkt(63))
    assert r.since_hit_s is None

# --- trend arrows ------------------------------------------------------

def test_trend_none_on_first_packet():
    e = TriageEngine()
    r = e.evaluate(pkt(0))
    assert r.hr_trend is None
    assert r.spo2_trend is None

def test_trend_rising():
    e = TriageEngine()
    e.evaluate(pkt(0, hr=85, spo2=98))
    r = e.evaluate(pkt(3, hr=95, spo2=98))
    assert r.hr_trend == "rising"
    assert r.spo2_trend == "steady"

def test_trend_falling():
    e = TriageEngine()
    e.evaluate(pkt(0, hr=85, spo2=98))
    r = e.evaluate(pkt(3, hr=85, spo2=94))
    assert r.spo2_trend == "falling"
    assert r.hr_trend == "steady"

def test_trend_dead_band_is_steady():
    # 1 bpm / 0 spo2 change should not register as rising/falling
    e = TriageEngine()
    e.evaluate(pkt(0, hr=85, spo2=98))
    r = e.evaluate(pkt(3, hr=86, spo2=98))
    assert r.hr_trend == "steady"
    assert r.spo2_trend == "steady"

def test_trend_computed_across_all_tiers():
    # trend keeps updating even while yellow/red, not just green
    e = TriageEngine()
    e.evaluate(pkt(0, hr=85))
    r = e.evaluate(pkt(3, hr=125))  # yellow (high hr)
    assert r.tier == YELLOW
    assert r.hr_trend == "rising"

def test_trend_missing_field_is_none_that_tick():
    e = TriageEngine()
    e.evaluate(pkt(0, hr=85))
    r = e.evaluate(pkt(3, hr=None))
    assert r.hr_trend is None
    # and prev_hr should be preserved (not clobbered by the missing reading)
    r2 = e.evaluate(pkt(6, hr=95))
    assert r2.hr_trend == "rising"

tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
failed = 0
for name, fn in tests:
    try:
        fn()
        print(f"PASS  {name}")
    except AssertionError as ex:
        failed += 1
        print(f"FAIL  {name}: {ex}")
    except Exception as ex:
        failed += 1
        print(f"ERROR {name}: {ex.__class__.__name__}: {ex}")
print(f"\n{len(tests)-failed}/{len(tests)} passed")
