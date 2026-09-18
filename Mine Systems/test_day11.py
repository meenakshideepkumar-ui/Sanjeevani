from triage import TriageEngine, GREEN, YELLOW, RED
import mine_simulator as sim

def pkt(ts, hr=85, spo2=98, g=0.5, wid="M07", **extra):
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2, "motion_g": g}
    p.update(extra)
    return p

# --- triage.py: signal health ------------------------------------------

def test_unknown_before_first_packet():
    e = TriageEngine()
    s = e.signal_status("M07", now=100)
    assert s["status"] == "unknown"
    assert s["silent_for_s"] is None

def test_ok_stale_lost_progression():
    e = TriageEngine()
    e.evaluate(pkt(0))
    assert e.signal_status("M07", 3)["status"] == "ok"
    assert e.signal_status("M07", 7)["status"] == "stale"     # boundary: >= 7
    assert e.signal_status("M07", 11)["status"] == "stale"
    assert e.signal_status("M07", 12)["status"] == "lost"     # boundary: >= 12
    assert e.signal_status("M07", 300)["status"] == "lost"

def test_silence_does_not_change_tier_or_reset_red():
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    e.evaluate(pkt(3, hr=150, spo2=84))         # red, latched
    s = e.signal_status("M07", now=100)
    assert s["status"] == "lost"
    assert s["last_tier"] == RED                # "lost - last known RED"
    assert e.evaluate(pkt(103)).tier == RED     # still red on return

def test_last_tier_tracks_yellow():
    e = TriageEngine()
    e.evaluate(pkt(0, hr=130))
    assert e.signal_status("M07", 50)["last_tier"] == YELLOW

def test_reconnect_reports_gap_only_after_lost():
    e = TriageEngine()
    e.evaluate(pkt(0))
    assert e.evaluate(pkt(3)).reconnected_after_s is None     # normal cadence
    assert e.evaluate(pkt(11)).reconnected_after_s is None    # 8s: stale, not lost
    r = e.evaluate(pkt(41))                                   # 30s gap
    assert r.reconnected_after_s == 30
    assert e.evaluate(pkt(44)).reconnected_after_s is None    # one-shot

def test_first_packet_has_no_reconnect():
    assert TriageEngine().evaluate(pkt(0)).reconnected_after_s is None

def test_workers_tracked_independently():
    e = TriageEngine()
    e.evaluate(pkt(0, wid="M07"))
    e.evaluate(pkt(0, wid="M08"))
    e.evaluate(pkt(20, wid="M08"))
    assert e.signal_status("M07", 20)["status"] == "lost"
    assert e.signal_status("M08", 20)["status"] == "ok"

def test_out_of_order_packet_does_not_rewind_last_seen():
    e = TriageEngine()
    e.evaluate(pkt(30))
    e.evaluate(pkt(10))
    assert e.signal_status("M07", 30)["last_seen_ts"] == 30

def test_reset_clears_signal_state():
    e = TriageEngine()
    e.evaluate(pkt(0))
    e.reset("M07")
    assert e.signal_status("M07", 50)["status"] == "unknown"

def test_thresholds_tunable():
    e = TriageEngine({"signal_stale_s": 2, "signal_lost_s": 4})
    e.evaluate(pkt(0))
    assert e.signal_status("M07", 3)["status"] == "stale"
    assert e.signal_status("M07", 4)["status"] == "lost"

# --- mine_simulator.py: dropout flag -------------------------------------

def test_dropout_flag_defaults_off_and_toggles():
    st = sim.new_state()
    assert st["dropout"] is False
    sim.start_dropout(st)
    assert st["dropout"] is True
    sim.end_dropout(st)
    assert st["dropout"] is False

def test_dropout_does_not_touch_phase_or_vitals_model():
    st = sim.new_state()
    sim.set_phase(st, "strain")
    sim.start_dropout(st)
    assert st["phase"] == "strain"
    # state still advances while dark: strain keeps pushing HR up
    hr0 = st["hr"]
    for i in range(6):
        sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=i)
    assert st["hr"] > hr0 + 10

def test_demo_script_link_actions_are_valid():
    for _, wid, action in sim.DEMO_SCRIPT:
        assert wid in sim.MINERS
        assert action in ("normal", "strain", "hit") + sim.LINK_ACTIONS
    m08 = [a for _, w, a in sim.DEMO_SCRIPT if w == "M08"]
    assert m08 == ["dropout", "reconnect"]      # every dropout is paired with a reconnect

# --- end to end: what the run loop's watchdog sees --------------------------

def test_dropout_then_reconnect_end_to_end():
    st, e = sim.new_state(), TriageEngine()
    ts = 0
    for _ in range(3):                                   # 3 healthy rounds
        e.evaluate(sim.build_packet("M08", sim.MINERS["M08"], st, "steady", ts=ts)); ts += 3
    sim.start_dropout(st)
    for _ in range(6):                                   # 18s dark: nothing evaluated
        sim.build_packet("M08", sim.MINERS["M08"], st, "steady", ts=ts); ts += 3
    assert e.signal_status("M08", ts)["status"] == "lost"
    sim.end_dropout(st)
    r = e.evaluate(sim.build_packet("M08", sim.MINERS["M08"], st, "steady", ts=ts))
    assert r.reconnected_after_s >= 12
    assert e.signal_status("M08", ts)["status"] == "ok"
    assert r.tier == GREEN

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
