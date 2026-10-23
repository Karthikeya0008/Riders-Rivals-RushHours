"""Benchmarks: social planner (maximise total welfare) and collusion (maximise joint profit).

The planner controls every instrument any game model gives the platforms, incentives w_A, w_B
(equivalently capacities) and fees p_A, p_B, within the same bounds. Its welfare is therefore an
upper bound for every model, and efficiency = W_model / W_planner <= 1. A fixed-fee planner
(w only, p = p_bar) is also reported to separate the incentive distortion from the fee distortion.

Collusion is an incentive cartel at the regulated fee p_bar: the joint-profit maximum over
(w_A, w_B). It is the cooperative outcome of the repeated incentive game.
"""
from __future__ import annotations

import numpy as np

from .common import make_env, package
from .solvers import grid_optimality_check, maximize


TIE_BREAK = 1e-3  # INR of objective per INR of incentive spend


def _seeds(f, axes: list, top: int = 4) -> list:
    """Best points of a coarse product grid, used to seed the local optimiser."""
    mesh = np.meshgrid(*axes, indexing="ij")
    pts = np.stack([m.ravel() for m in mesh], axis=1)
    vals = np.array([f(p) for p in pts])
    order = np.argsort(-vals)[:top]
    return [list(pts[j]) for j in order]


def _optimize(f, bounds: list, seed_axes: list, check_axes: list, cfg):
    seeds = _seeds(f, seed_axes)
    x, val = maximize(f, bounds, seeds)
    check = grid_optimality_check(f, x, check_axes, tol_rel=cfg["solver"]["deviation_tol_rel"],
                                  tol_abs=cfg["solver"]["deviation_tol_abs"])
    return x, val, check


def _optimize_w(env, cfg, objective):
    wb = tuple(cfg["bounds"]["w"])
    return _optimize(objective, [wb, wb], [np.linspace(wb[0], wb[1], 26)] * 2,
                     [np.linspace(wb[0], wb[1], 41)] * 2, cfg)


def solve_collusion(cfg: dict, scenario) -> dict:
    env = make_env(cfg, scenario)

    def joint(z):
        a, b = env.profits(wA=z[0], wB=z[1])
        return a + b
    x, val, check = _optimize_w(env, cfg, joint)
    out = env.evaluate(wA=x[0], wB=x[1])
    notes = [
        "Platforms jointly choose incentives to maximise combined profit (fees at the regulated p).",
        "This is the 'cooperate' outcome that an incentive cartel would try to sustain in the "
        "repeated game; it is not an equilibrium of the one-shot game.",
    ]
    return package("collusion", "Collusion (joint profit)", scenario, env, out, "w", x,
                   {**check, "kind": "joint-optimum"}, {"converged": True}, None, notes,
                   {"joint_profit": val})


def solve_planner(cfg: dict, scenario) -> dict:
    env = make_env(cfg, scenario)
    wb, pb = tuple(cfg["bounds"]["w"]), tuple(cfg["bounds"]["p"])

    def objective(**kw):
        o = env.evaluate(**kw)
        return o["total_welfare"] - TIE_BREAK * o["total_incentive_spend"]

    def W_full(z):
        return objective(wA=z[0], wB=z[1], pA=z[2], pB=z[3])

    def W_fixed(z):
        return objective(wA=z[0], wB=z[1])

    x, val, check = _optimize(
        W_full, [wb, wb, pb, pb],
        [np.linspace(wb[0], wb[1], 11)] * 2 + [np.linspace(pb[0], pb[1], 13)] * 2,
        [np.linspace(wb[0], wb[1], 8)] * 2 + [np.linspace(pb[0], pb[1], 8)] * 2, cfg)
    out = env.evaluate(wA=x[0], wB=x[1], pA=x[2], pB=x[3])

    xf, _, _ = _optimize_w(env, cfg, W_fixed)
    fixed_out = env.evaluate(wA=xf[0], wB=xf[1])
    valf = fixed_out["total_welfare"]
    notes = [
        "The planner maximises consumer surplus + platform profits + rider surplus, choosing "
        "incentives and fees for both platforms.",
        "Fees and incentives are transfers. The planner uses them only for their allocative "
        "effects: how many customers order, how many riders work, and how congested each fleet is.",
        "Once the rider pool is exhausted, extra incentive is a pure transfer and welfare is flat; a "
        "tiny tie-break (0.001 per INR of incentive spend) selects the smallest such incentive.",
    ]
    extras = {
        "fixed_fee_planner": {"w": [float(v) for v in xf], "p": env.P.p, "welfare": valf,
                              "outcome": fixed_out},
    }
    return package("planner", "Social planner", scenario, env, out, "w", x[:2],
                   {**check, "kind": "joint-optimum"}, {"converged": True}, None, notes,
                   {**extras, "fees": [float(x[2]), float(x[3])]})
