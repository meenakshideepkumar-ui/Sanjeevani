from triage import TriageEngine, GREEN, YELLOW, RED, UNSPECIFIED, BLEEDING_SHOCK
import mine_simulator as sim

def pkt(ts, hr=85, spo2=98, g=0.5, wid="M07", **extra):
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2, "motion_g": g}
    p.update(extra)
    return p

# --- triage.py: panic overrides everything ------------------------------

def test_panic_alone_is_red_with_healthy_vitals():
    e = TriageEngine()
    r = e.evaluate(pkt(0, panic=True))
    assert r.tier == RED
    assert r.manual_trigger is True
    assert "manual panic button pressed" in r.reasons[0]
    assert r.injury_hint == UNSPECIFIED   # no vitals distress, nothing to classify

def test_panic_bypasses_impact_window():
    # no impact at all, ever - panic alone still forces red
    e = TriageEngine()
    assert e.evaluate(pkt(0)).tier == GREEN
    r = e.evaluate(pkt(100, panic=True))
    assert r.tier == RED

def test_panic_with_real_crash_still_classifies_pattern():
    e = TriageEngine()
    r = e.evaluate(pkt(0, hr=150, spo2=84, panic=True))
    assert r.tier == RED
    assert r.manual_trigger is True
    assert r.injury_hint == BLEEDING_SHOCK
    assert "manual panic button pressed" in r.reasons

def test_panic_field_name_alt_accepted():
    e = TriageEngine()
    r = e.evaluate(pkt(0, panic_button=True))
    assert r.tier == RED

def test_panic_hit_ts_is_press_time_when_no_impact():
    e = TriageEngine()
    e.evaluate(pkt(50, panic=True))
    assert e.worker_state("M07")["hit_ts"] == 50

def test_panic_latches_and_manual_trigger_persists():
    e = TriageEngine()
    e.evaluate(pkt(0, panic=True))
    r = e.evaluate(pkt(60))  # later packet, panic not resent, still latched
    assert r.tier == RED
    assert r.manual_trigger is True
    assert r.since_hit_s == 60

def test_panic_does_not_reopen_already_latched_red():
    # auto-detected red first, then a (redundant) panic press shouldn't change hit_ts/reason
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    e.evaluate(pkt(6, hr=150, spo2=84))
    assert e.worker_state("M07")["manual_trigger"] is False
    r = e.evaluate(pkt(10, panic=True))
    assert r.tier == RED
    assert r.manual_trigger is False   # latch branch returns the ORIGINAL cause
    assert "latched" in r.reasons[0]

def test_no_panic_field_behaves_as_before():
    e = TriageEngine()
    assert e.evaluate(pkt(0)).tier == GREEN

def test_panic_clears_on_reset():
    e = TriageEngine()
    e.evaluate(pkt(0, panic=True))
    e.reset("M07")
    r = e.evaluate(pkt(5))
    assert r.tier == GREEN
    assert r.manual_trigger is False

# --- mine_simulator.py: one-shot trigger ---------------------------------

def test_trigger_panic_is_one_shot():
    st = sim.new_state()
    sim.trigger_panic(st)
    p1 = sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=0)
    assert p1["panic"] is True
    p2 = sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=3)
    assert p2["panic"] is False

def test_trigger_panic_does_not_touch_phase():
    st = sim.new_state()
    sim.trigger_panic(st)
    assert st["phase"] == "normal"
    p1 = sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=0)
    # vitals should look like a normal healthy tick, not a casualty phase
    assert 60 <= p1["hr"] <= 110

def test_panic_press_drives_engine_to_red_end_to_end():
    st = sim.new_state()
    engine = TriageEngine()
    sim.trigger_panic(st)
    p = sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=0)
    r = engine.evaluate(p)
    assert r.tier == RED
    assert r.manual_trigger is True

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
