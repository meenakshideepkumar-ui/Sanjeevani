import json, random
from triage import TriageEngine, GREEN, YELLOW, RED, BLEEDING_SHOCK
import mine_simulator as sim

M = sim.MINERS["M07"]
RED_ONLY = {"injury_hint", "since_hit_s", "manual_trigger"}

def step(st, eng, ts, wid="M07"):
    p = sim.build_packet(wid, M, st, "steady", ts=ts)
    r = eng.evaluate(p)
    return sim.attach_triage(p, r), r

# --- shape of each tier ------------------------------------------------------

def test_first_green_packet_only_adds_tier():
    p, _ = step(sim.new_state(), TriageEngine(), 0)
    assert p["triage_tier"] == GREEN
    for k in RED_ONLY | {"hr_trend", "spo2_trend", "reasons", "reconnected_after_s"}:
        assert k not in p, k

def test_green_packet_after_first_has_trends_only():
    random.seed(1)
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    p, _ = step(st, e, 3)
    assert p["hr_trend"] in ("rising", "falling", "steady")
    assert p["spo2_trend"] in ("rising", "falling", "steady")
    assert not (RED_ONLY & set(p))
    assert "reasons" not in p

def test_yellow_packet_carries_reasons_not_red_fields():
    random.seed(2)
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    sim.set_phase(st, "strain")
    yellow = None
    for k in range(1, 15):
        p, r = step(st, e, k * 3)
        if r.tier == YELLOW:
            yellow = p; break
    assert yellow is not None
    assert yellow["reasons"] and isinstance(yellow["reasons"], list)
    assert not (RED_ONLY & set(yellow))

def test_red_packet_has_hint_timer_and_manual_flag():
    random.seed(3)
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    sim.set_phase(st, "hit")
    red = None
    for k in range(1, 10):
        p, r = step(st, e, k * 3)
        if r.tier == RED:
            red = p; break
    assert red["triage_tier"] == RED
    assert red["injury_hint"] == BLEEDING_SHOCK
    assert isinstance(red["since_hit_s"], int) and red["since_hit_s"] >= 0
    assert red["manual_trigger"] is False

def test_latched_red_keeps_fields_on_later_packets():
    random.seed(4)
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    sim.set_phase(st, "hit")
    later = None
    for k in range(1, 12):
        p, r = step(st, e, k * 3)
        later = p
    assert later["triage_tier"] == RED
    assert RED_ONLY <= set(later)
    assert later["since_hit_s"] > 0

def test_panic_only_red_is_marked_manual_and_unspecified():
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    sim.trigger_panic(st)
    p, _ = step(st, e, 3)
    assert p["triage_tier"] == RED
    assert p["manual_trigger"] is True
    assert p["injury_hint"] == "unspecified"

def test_reconnected_after_s_only_on_first_packet_back():
    st, e = sim.new_state(), TriageEngine()
    step(st, e, 0)
    p_gap, _ = step(st, e, 60)
    assert p_gap["reconnected_after_s"] == 60
    p_next, _ = step(st, e, 63)
    assert "reconnected_after_s" not in p_next

# --- what a strict JSON consumer (Java) will see -------------------------------

def test_no_null_values_ever_emitted():
    random.seed(5)
    st, e = sim.new_state(), TriageEngine()
    sim.set_phase(st, "hit")
    for k in range(12):
        p, _ = step(st, e, k * 3)
        assert None not in p.values(), p

def test_packets_round_trip_as_json_with_stable_types():
    random.seed(6)
    st, e = sim.new_state(), TriageEngine()
    sim.set_phase(st, "hit")
    for k in range(12):
        p, _ = step(st, e, k * 3)
        q = json.loads(json.dumps(p))
        assert q == p
        assert isinstance(q["ts"], int) and isinstance(q["hr"], int)
        assert isinstance(q["panic"], bool)
        if "since_hit_s" in q:
            assert isinstance(q["since_hit_s"], int)

def test_red_packet_size_stays_reasonable():
    random.seed(7)
    st, e = sim.new_state(), TriageEngine()
    sim.set_phase(st, "hit")
    biggest = 0
    for k in range(12):
        p, _ = step(st, e, k * 3)
        biggest = max(biggest, len(json.dumps(p, separators=(",", ":"))))
    assert biggest < 600

# --- old behaviour untouched -----------------------------------------------------

def test_triage_tier_still_present_on_every_packet():
    random.seed(8)
    st, e = sim.new_state(), TriageEngine()
    for k in range(20):
        p, _ = step(st, e, k * 3)
        assert p["triage_tier"] in (GREEN, YELLOW, RED)

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
