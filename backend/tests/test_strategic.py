"""Strategic-form lab, repeated game and Bayesian game."""
import numpy as np
import pytest

from engine.bayesian import bayesian_br_iteration, solve_bayesian
from engine.config import build_config
from engine.matrix_game import analyze, market_matrix
from engine.repeated import critical_delta, play_match, solve_repeated

CFG = build_config()


def test_matching_pennies_mixed_ne_is_half_half():
    res = analyze([[1, -1], [-1, 1]], [[-1, 1], [1, -1]], ["H", "T"], ["H", "T"])
    assert res["pure_nash"] == []
    assert len(res["mixed_nash"]) == 1
    ne = res["mixed_nash"][0]
    assert ne["row"] == pytest.approx([0.5, 0.5])
    assert ne["col"] == pytest.approx([0.5, 0.5])


def test_textbook_prisoners_dilemma_and_grim_trigger_delta():
    # T=5, R=3, P=1, S=0  ->  delta* = (5-3)/(5-1) = 0.5
    A = [[3, 0], [5, 1]]
    B = [[3, 5], [0, 1]]
    res = analyze(A, B, ["C", "D"], ["C", "D"])
    assert res["classification"]["is_pd"]
    assert res["pure_nash"] == [[1, 1]]
    assert res["iesds"]["solved"] and res["iesds"]["remaining_rows"] == ["D"]
    assert critical_delta(5, 3, 1) == pytest.approx(0.5)


def test_iesds_textbook_game_with_mixed_domination():
    # Row's M is dominated only by a 50/50 mix of T and B (classic example)
    A = [[3, 0], [1, 1], [0, 3]]
    B = [[1, 0], [1, 0], [1, 0]]
    res = analyze(A, B, ["T", "M", "B"], ["L", "R"])
    elim = [(s["player"], s["eliminated"]) for s in res["iesds"]["steps"]]
    assert ("Column", "R") in elim  # R strictly dominated by L for the column player
    first_row = next(s for s in res["iesds"]["steps"] if s["player"] == "Row" and s["eliminated"] == "M") \
        if any(s["eliminated"] == "M" for s in res["iesds"]["steps"]) else None
    # after R is removed, T strictly dominates both M and B
    assert res["iesds"]["remaining_rows"] == ["T"]
    assert first_row is not None


def test_weak_dominance_elimination():
    A = [[1, 1], [1, 0]]   # D weakly dominated by U
    B = [[2, 1], [1, 1]]   # R weakly dominated by L
    res = analyze(A, B, ["U", "D"], ["L", "R"])
    assert res["iesds"]["steps"] == []  # nothing strictly dominated
    assert res["iewds"]["solved"]
    assert res["iewds"]["remaining_rows"] == ["U"] and res["iewds"]["remaining_cols"] == ["L"]


def test_maxmin_of_matching_pennies():
    res = analyze([[1, -1], [-1, 1]], [[-1, 1], [1, -1]], ["H", "T"], ["H", "T"])
    assert res["maxmin"]["row"]["mixed"] == pytest.approx([0.5, 0.5], abs=1e-6)
    assert res["maxmin"]["row"]["mixed_value"] == pytest.approx(0.0, abs=1e-9)
    assert res["maxmin"]["row"]["pure_value"] == -1


@pytest.mark.parametrize("scenario", list(CFG["scenarios"]))
def test_market_low_high_game_is_a_prisoners_dilemma(scenario):
    mm = market_matrix(CFG, scenario)
    assert mm["low_high"]["classification"]["is_pd"]
    assert mm["full"]["iesds"]["solved"]
    assert mm["full"]["pure_nash"] == [[2, 2]]


def test_grim_trigger_sustains_cooperation_without_noise():
    A = np.array([[3, 0], [5, 1]], float)
    B = A.T.copy()
    rng = np.random.default_rng(0)
    res = play_match("GRIM", "GRIM", A, B, T=20, delta=0.9, noise=0.0, generosity=0.3, reps=1, rng=rng)
    assert res["cooperation_rate"] == 1.0
    res = play_match("GRIM", "ALLD", A, B, T=20, delta=0.9, noise=0.0, generosity=0.3, reps=1, rng=rng)
    assert res["cooperation_rate"] == 0.0


def test_noise_breaks_grim_more_than_generous_tft():
    A = np.array([[3, 0], [5, 1]], float)
    B = A.T.copy()
    rng = np.random.default_rng(1)
    grim = play_match("GRIM", "GRIM", A, B, 60, 0.95, 0.05, 0.3, 300, rng)["cooperation_rate"]
    gtft = play_match("GTFT", "GTFT", A, B, 60, 0.95, 0.05, 0.3, 300, rng)["cooperation_rate"]
    assert gtft > grim


def test_market_repeated_game_delta_star():
    res = solve_repeated(CFG, "Medium")
    sg = res["stage_game"]
    assert res["delta_star"] == pytest.approx((sg["T"] - sg["R"]) / (sg["T"] - sg["P"]))
    assert 0 < res["delta_star"] < 1
    assert res["delta_star_nash_reversion"] < res["delta_star"]


def test_linear_bayesian_cournot_matches_closed_form():
    # Gibbons: P = a - q1 - q2, firm 1 cost c, firm 2 cost cH (prob th) or cL
    a, c, cH, cL, th = 100.0, 10.0, 20.0, 5.0, 0.4
    prior2 = {"H": th, "L": 1 - th}
    cost2 = {"H": cH, "L": cL}

    def exp_payoff(i, ti, ai, s):
        if i == 0:
            return sum(prior2[t] * ai * (a - ai - s[(1, t)] - c) for t in ("H", "L"))
        return ai * (a - ai - s[(0, "x")] - cost2[ti])

    s, ok, _ = bayesian_br_iteration(exp_payoff, lambda i, s: (0.0, a),
                                     {(0, "x"): 10.0, (1, "H"): 10.0, (1, "L"): 10.0})
    assert ok
    assert s[(1, "H")] == pytest.approx((a - 2 * cH + c) / 3 + (1 - th) * (cH - cL) / 6, abs=1e-4)
    assert s[(1, "L")] == pytest.approx((a - 2 * cL + c) / 3 - th * (cH - cL) / 6, abs=1e-4)
    assert s[(0, "x")] == pytest.approx((a - 2 * c + th * cH + (1 - th) * cL) / 3, abs=1e-4)


def test_market_bayesian_cournot_is_verified_and_high_type_hires_more():
    res = solve_bayesian(CFG, "Peak", prior_high=0.5)
    assert res["converged"] and res["verification"]["passed"]
    assert res["strategies"]["A"]["H"] > res["strategies"]["A"]["L"]
