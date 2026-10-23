"""Market game models: every equilibrium/optimum is verified for every scenario."""
import pytest

from engine.config import build_config
from engine.registry import COMPARISON_MODELS, compare, solve

CFG = build_config()


@pytest.fixture(scope="module")
def comparison():
    return compare(CFG)


def test_every_model_and_scenario_passes_deviation_check(comparison):
    failures = [(r["model"], r["scenario"]) for r in comparison["rows"] if not r["verified"]]
    assert failures == []
    assert len(comparison["rows"]) == len(COMPARISON_MODELS) * len(CFG["scenarios"])


def test_planner_is_an_upper_bound_on_welfare(comparison):
    for r in comparison["rows"]:
        assert r["efficiency"] <= 1.0 + 1e-6, (r["model"], r["scenario"], r["efficiency"])
        assert r["efficiency"] > 0


def test_fixed_points_converged_in_every_equilibrium(comparison):
    for s in CFG["scenarios"]:
        for m in COMPARISON_MODELS:
            assert solve(m, CFG, s, curves=False)["outcome"]["fixed_point"]["converged"]


def test_incentive_war_spends_more_than_capacity_competition(comparison):
    rows = {(r["model"], r["scenario"]): r for r in comparison["rows"]}
    for s in CFG["scenarios"]:
        b, c = rows[("bertrand_incentive", s)], rows[("cournot", s)]
        assert b["total_incentive_spend"] > c["total_incentive_spend"]
        assert b["total_profit"] < c["total_profit"]


def test_collusion_beats_competition_on_joint_profit(comparison):
    rows = {(r["model"], r["scenario"]): r for r in comparison["rows"]}
    for s in CFG["scenarios"]:
        assert rows[("collusion", s)]["total_profit"] >= rows[("bertrand_incentive", s)]["total_profit"] - 1


def test_homogeneous_bertrand_paradox_in_market():
    res = solve("bertrand_homogeneous", CFG, "Medium", curves=False)
    margin = CFG["market"]["p"] + CFG["market"]["m"]
    diff = solve("bertrand_incentive", CFG, "Medium", curves=False)
    assert res["verification"]["passed"]
    assert res["equilibrium"]["A"] > 0.95 * margin       # incentive bid up to the per-order margin
    assert res["outcome"]["profit"][0] < 0.1 * diff["outcome"]["profit"][0]


def test_stackelberg_reports_first_mover_advantage():
    for m in ("stackelberg_capacity", "stackelberg_incentive"):
        res = solve(m, CFG, "Peak")
        assert res["verification"]["passed"]
        assert res["extras"]["first_mover_advantage"] >= -1.0  # leader can always mimic simultaneous play


def test_two_stage_capacity_is_close_to_cournot():
    res = solve("two_stage", CFG, "Medium", curves=False)
    cN = res["extras"]["cournot_capacity"][0]
    assert res["equilibrium"]["A"] == pytest.approx(cN, rel=0.05)


def test_br_curves_intersect_at_equilibrium():
    res = solve("cournot", CFG, "Medium")
    eq = res["equilibrium"]
    # B's best response to A's equilibrium capacity is B's equilibrium capacity
    curve = res["br_curves"]["B"]
    nearest = min(curve, key=lambda p: abs(p["x"] - eq["A"]))
    assert nearest["y"] == pytest.approx(eq["B"], rel=0.05)
