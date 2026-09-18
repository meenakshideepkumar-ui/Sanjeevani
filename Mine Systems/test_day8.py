from triage import TriageEngine, RED, BLEEDING_SHOCK, BREATHING, BLAST, UNSPECIFIED

def pkt(ts, hr=85, spo2=98, g=0.5, wid="M07", **extra):
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2, "motion_g": g}
    p.update(extra)
    return p

def test_bleeding_shock_pattern():
    # tachycardia + spo2 drop, ordinary impact, no seismic
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    r = e.evaluate(pkt(6, hr=150, spo2=85))
    assert r.tier == RED
    assert r.injury_hint == BLEEDING_SHOCK, r.injury_hint

def test_breathing_pattern_normal_hr():
    # spo2 crashes, HR stays normal - airway problem, not shock
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    r = e.evaluate(pkt(6, hr=90, spo2=85))
    assert r.tier == RED
    assert r.injury_hint == BREATHING, r.injury_hint

def test_breathing_pattern_bradycardic():
    # spo2 crashes with HR crashing LOW (not high) - still breathing, not shock
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    r = e.evaluate(pkt(6, hr=40, spo2=85))
    assert r.tier == RED
    assert r.injury_hint == BREATHING, r.injury_hint

def test_blast_pattern():
    # huge impact + seismic spike + crash -> blast, even though HR/SpO2
    # pattern alone would look like bleeding_shock
    e = TriageEngine()
    e.evaluate(pkt(0, g=8.0, seismic_reading=0.9))
    r = e.evaluate(pkt(6, hr=150, spo2=85, seismic_reading=0.7))
    assert r.tier == RED
    assert r.injury_hint == BLAST, r.injury_hint

def test_normal_impact_with_seismic_is_not_blast():
    # seismic spike alone without a big-enough impact shouldn't say blast
    e = TriageEngine()
    e.evaluate(pkt(0, g=4.5, seismic_reading=0.9))
    r = e.evaluate(pkt(6, hr=150, spo2=85, seismic_reading=0.7))
    assert r.tier == RED
    assert r.injury_hint == BLEEDING_SHOCK, r.injury_hint

def test_hint_persists_through_latch():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    r1 = e.evaluate(pkt(6, hr=150, spo2=85))
    assert r1.injury_hint == BLEEDING_SHOCK
    # vitals fully recover, still latched red - hint should NOT flicker/disappear
    r2 = e.evaluate(pkt(60, hr=85, spo2=98))
    assert r2.tier == RED
    assert r2.injury_hint == BLEEDING_SHOCK, r2.injury_hint

def test_hint_clears_on_reset():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    e.evaluate(pkt(6, hr=150, spo2=85))
    e.reset("M07")
    r = e.evaluate(pkt(63))
    assert r.injury_hint is None

tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
failed = 0
for name, fn in tests:
    try:
        fn()
        print(f"PASS  {name}")
    except AssertionError as ex:
        failed += 1
        print(f"FAIL  {name}: {ex}")
print(f"\n{len(tests)-failed}/{len(tests)} passed")
