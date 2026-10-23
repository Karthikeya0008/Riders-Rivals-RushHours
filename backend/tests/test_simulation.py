"""Agent-based simulation: payload size, Monte Carlo CIs, agreement with the analytical delay."""
import json

import numpy as np
import pytest

from engine.config import build_config
from simulation.abm import peak_curve
from simulation.runner import run_simulation, validate_scenarios

CFG = build_config()


def test_peak_curve_has_mean_one_and_peak_factor():
    c = peak_curve(180, 1.35)
    assert c.mean() == pytest.approx(1.0)
    assert c.max() == pytest.approx(1.35, abs=0.01)
    assert c.min() > 0


def test_simulation_is_reproducible_and_small():
    a = run_simulation(CFG, "Peak", mc_runs=0, seed=5)
    b = run_simulation(CFG, "Peak", mc_runs=0, seed=5)
    assert a["summary"] == b["summary"]
    assert len(json.dumps(a)) < 5_000_000
    # rider split follows the logit rule with the equilibrium incentives
    for idx, name in enumerate("AB"):
        assert a["summary"][name]["mean_active_riders"] == pytest.approx(a["equilibrium"]["N"][idx], rel=0.1)


def test_monte_carlo_confidence_intervals():
    r = run_simulation(CFG, "Medium", mc_runs=6)
    agg = r["monte_carlo"]["aggregate"]["A"]["mean_delay"]
    assert agg["n"] == 6 and agg["lo"] <= agg["mean"] <= agg["hi"]


def test_simulated_delay_tracks_analytical_delay():
    v = validate_scenarios(CFG, runs=4)
    sims = [r["sim_mean"] for r in v["rows"]]
    ans = [r["analytic_realized"] for r in v["rows"]]
    # both rise with demand
    assert sims[-1] > sims[0] and ans[-1] > ans[0]
    # average absolute percentage error of the per-minute comparison stays below 30 %
    assert v["overall_mape"] < 0.30
    # window-average delays agree within 25 %
    assert np.max(np.abs(np.array(sims) - np.array(ans)) / np.array(ans)) < 0.25
