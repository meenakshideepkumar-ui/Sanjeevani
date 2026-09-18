import random
from triage import TriageEngine, GREEN, YELLOW, RED, BLEEDING_SHOCK, BREATHING, UNSPECIFIED
import mine_simulator as sim

def pkt(ts, hr=85, spo2=98, g=0.5, wid="M07", **extra):
    p = {"worker_id": wid, "ts": ts, "hr": hr, "spo2": spo2, "motion_g": g}
    p.update(extra)
    return p

def red_hint(hr, spo2, **extra):
    e = TriageEngine()
    e.evaluate(pkt(0, g=7.0))
    r = e.evaluate(pkt(3, hr=hr, spo2=spo2, **extra))
    assert r.tier == RED
    return r.injury_hint

# --- hint: first-tick crash while HR is still climbing ------------------

def test_spo2_crash_with_tachycardia_below_crash_hr_is_shock():
    assert red_hint(138, 88) == BLEEDING_SHOCK       # the demo's first red tick

def test_shock_hr_boundary():
    assert red_hint(120, 88) == BLEEDING_SHOCK
    assert red_hint(119, 88) == BREATHING

def test_spo2_crash_with_normal_hr_still_breathing():
    assert red_hint(90, 85) == BREATHING

def test_spo2_crash_with_low_hr_still_breathing():
    assert red_hint(40, 85) == BREATHING

def test_panic_on_strained_worker_without_crash_stays_unspecified():
    e = TriageEngine()
    r = e.evaluate(pkt(0, hr=130, spo2=95, panic=True))
    assert r.tier == RED and r.injury_hint == UNSPECIFIED

def test_shock_hr_tunable():
    e = TriageEngine({"shock_hr": 130})
    e.evaluate(pkt(0, g=7.0))
    assert e.evaluate(pkt(3, hr=125, spo2=88)).injury_hint == BREATHING

# --- sweeps: normal shift stays green, demo reads right -----------------

def test_no_false_positives_for_steady_miners_over_shifts():
    for seed in range(5):
        random.seed(seed)
        states = {w: sim.new_state() for w in ("M07", "M08")}
        e = TriageEngine()
        for k in range(9600):                          # 8 h at 3 s
            for w in states:
                p = sim.build_packet(w, sim.MINERS[w], states[w], "steady", ts=k*3)
                assert e.evaluate(p).tier == GREEN, f"seed {seed} {w} tick {k}"

def test_demo_hit_goes_red_as_shock_across_seeds():
    for seed in range(30):
        random.seed(seed)
        st, e = sim.new_state(), TriageEngine()
        for k in range(5):
            e.evaluate(sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=k*3))
        sim.set_phase(st, "strain")
        tiers = []
        for k in range(5, 12):
            tiers.append(e.evaluate(sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=k*3)).tier)
        assert YELLOW in tiers and RED not in tiers, f"seed {seed}: {tiers}"
        sim.set_phase(st, "hit")
        res = [e.evaluate(sim.build_packet("M07", sim.MINERS["M07"], st, "steady", ts=k*3)) for k in range(12, 20)]
        red = next(r for r in res if r.tier == RED)
        assert red.injury_hint == BLEEDING_SHOCK, f"seed {seed}"

def test_accumulating_miner_turns_yellow_on_gas_not_before_2min():
    random.seed(1)
    st, e = sim.new_state(), TriageEngine()
    first = None
    for k in range(400):
        r = e.evaluate(sim.build_packet("M09", sim.MINERS["M09"], st, "accumulating", ts=k*3))
        if r.tier == YELLOW:
            first = k*3
            break
    assert first is not None and first >= 120

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
