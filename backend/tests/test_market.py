import math

import pytest

from engine.config import MarketParams, build_config
from engine.market import MarketEnvironment

CFG = build_config()
PARAMS = MarketParams.from_config(CFG)
SCENARIOS = CFG["scenarios"]


def env(demand=1000, **changes):
    return MarketEnvironment(PARAMS.with_(**changes), demand)


def test_rider_supply_sums_to_pool_and_is_symmetric():
    NA, NB, N0 = env().rider_supply(30.0, 30.0)
    assert NA + NB + N0 == pytest.approx(PARAMS.R)
    assert NA == pytest.approx(NB)
    # at w = w0 everyone (A, B, outside) is equally attractive
    NA, NB, N0 = env().rider_supply(PARAMS.w0, PARAMS.w0)
    assert NA == pytest.approx(PARAMS.R / 3)


def test_inverse_rider_supply_round_trip():
    e = env()
    for wA, wB in [(10, 40), (25, 25), (55, 30), (70, 70)]:
        NA, NB, _ = e.rider_supply(wA, wB)
        wA2, wB2 = e.incentive_for_capacity(NA, NB)
        assert wA2 == pytest.approx(wA, abs=1e-9)
        assert wB2 == pytest.approx(wB, abs=1e-9)


def test_raising_own_incentive_pulls_riders_from_rival():
    e = env()
    NA1, NB1, _ = e.rider_supply(30, 30)
    NA2, NB2, _ = e.rider_supply(40, 30)
    assert NA2 > NA1 and NB2 < NB1


@pytest.mark.parametrize("scenario", list(SCENARIOS))
def test_fixed_point_converges_for_all_scenarios(scenario):
    e = env(SCENARIOS[scenario])
    for wA in (0, 10, 25, 40, 60, 90):
        for wB in (0, 25, 60):
            for p in (10, 35, 80):
                out = e.evaluate(wA=wA, wB=wB, pA=p, pB=p)
                fp = out["fixed_point"]
                assert fp["converged"], (scenario, wA, wB, p, fp)
                assert fp["residual"] < 1e-7
                # the solution really is a fixed point of D = g(lambda(D))
                for i in range(2):
                    assert out["delay"][i] == pytest.approx(e.delay_from_rho(out["rho_raw"][i]), abs=1e-6)


@pytest.mark.parametrize("scenario", list(SCENARIOS))
def test_newton_matches_plain_damped_iteration(scenario):
    e = env(SCENARIOS[scenario])
    for wA, wB in [(5, 5), (25, 40), (60, 60), (2, 80)]:
        a = e.evaluate(wA=wA, wB=wB, method="newton")
        b = e.evaluate(wA=wA, wB=wB, method="damped")
        assert b["fixed_point"]["converged"]
        assert a["delay"] == pytest.approx(b["delay"], abs=1e-5)
        assert a["demand"] == pytest.approx(b["demand"], rel=1e-6)


def test_delay_increases_with_demand():
    delays = [env(L).evaluate(wA=30, wB=30)["delay"][0] for L in SCENARIOS.values()]
    assert all(d2 > d1 for d1, d2 in zip(delays, delays[1:]))


def test_delay_rations_demand_before_the_cap_binds():
    # with the default delay sensitivity, congestion delay chokes demand off below rho_max
    out = env(2000).evaluate(NA=10, NB=10)
    assert out["rho_raw"][0] < PARAMS.rho_max
    assert out["unserved"][0] == pytest.approx(0.0)
    assert out["delay"][0] > 60


def test_capacity_cap_creates_unserved_orders():
    # customers who barely react to delay overwhelm capacity -> orders beyond rho_max * mu are cancelled
    out = env(2000, c=0.001).evaluate(NA=10, NB=10)
    assert out["rho"][0] == pytest.approx(PARAMS.rho_max)
    assert out["unserved"][0] > 0
    assert out["completed"][0] == pytest.approx(PARAMS.rho_max * PARAMS.k * 10)


def test_fast_profit_path_matches_full_evaluation():
    e = env(1500)
    full = e.evaluate(wA=33, wB=47, pA=30, pB=40)
    fast = e.profits(wA=33, wB=47, pA=30, pB=40)
    assert fast == pytest.approx(tuple(full["profit"]))


def test_welfare_accounting_identity():
    out = env(1000).evaluate(wA=40, wB=35)
    assert out["total_welfare"] == pytest.approx(
        out["consumer_surplus"] + out["total_profit"] + out["rider_surplus"])
    assert out["consumer_surplus"] > 0
