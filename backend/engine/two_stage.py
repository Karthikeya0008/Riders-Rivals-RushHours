"""Two-stage game: platforms first choose capacity N_i (stage 1, incentives follow from the
inverse rider supply), then, observing capacities, choose fees p_i (stage 2). Solved for the
subgame-perfect equilibrium by backward induction."""
from __future__ import annotations

import numpy as np

from .common import (capacity_bounds, capacity_plot_range, const_bounds, deviation_kw, make_env,
                     package)
from .solvers import br_curves, deviation_check, nash_br_iteration


class FeeSubgame:
    """Stage-2 fee equilibrium for given capacities, memoised and warm-started."""

    def __init__(self, env, cfg):
        self.env = env
        self.bounds = const_bounds(cfg["bounds"]["p"])
        self.cache: dict = {}
        self.warm = [env.P.p, env.P.p]
        self.grid = 31

    def payoff_fn(self, NA, NB):
        wA, wB = self.env.incentive_for_capacity(NA, NB)

        def payoff(i, x):
            return self.env.profits(wA=wA, wB=wB, pA=x[0], pB=x[1], NA=NA, NB=NB)[i]
        return payoff

    def solve(self, NA: float, NB: float):
        key = (round(NA, 6), round(NB, 6))
        if key not in self.cache:
            ne = nash_br_iteration(self.payoff_fn(NA, NB), self.bounds, self.warm, grid=self.grid,
                                   max_iter=100, tol=1e-5)
            self.warm = list(ne.x)
            self.cache[key] = ne
        return self.cache[key]


def solve_two_stage(cfg: dict, scenario, cournot: dict | None = None, curves: bool = True) -> dict:
    env = make_env(cfg, scenario)
    sub = FeeSubgame(env, cfg)
    cap_bounds = capacity_bounds(env, cfg)

    def payoff1(i, N):
        return sub.solve(N[0], N[1]).payoffs[i]

    R = env.P.R
    x0 = [cournot["equilibrium"]["A"], cournot["equilibrium"]["B"]] if cournot else [R / 3, R / 3]
    ne1 = nash_br_iteration(payoff1, cap_bounds, x0, grid=21, max_iter=60, tol=1e-3)
    N = ne1.x
    stage2 = sub.solve(N[0], N[1])
    p = stage2.x

    dkw = deviation_kw(cfg)
    check1 = deviation_check(payoff1, N, cap_bounds, grid=61, tol_rel=dkw["tol_rel"], tol_abs=dkw["tol_abs"])
    check2 = deviation_check(sub.payoff_fn(N[0], N[1]), p, sub.bounds, **dkw)
    verification = {
        "passed": bool(check1["passed"] and check2["passed"]),
        "players": check1["players"],
        "stage1": check1, "stage2": check2, "grid_points": check1["grid_points"],
    }
    out = env.evaluate(NA=N[0], NB=N[1], pA=p[0], pB=p[1])

    brc = None
    if curves:
        rng = capacity_plot_range(env, cfg)
        brc = br_curves(payoff1, cap_bounds, (rng, rng), points=13, grid=15)

    # game tree: a few symmetric/asymmetric capacity pairs and their fee subgame outcomes
    tree = []
    for frac in (0.6, 0.8, 1.0, 1.2):
        for side in (0, 1):
            NA = N[0] * frac if side == 0 else N[0]
            NB = N[1] if side == 0 else N[1] * frac
            if NA + NB >= R - 1:
                continue
            s = sub.solve(NA, NB)
            tree.append({"N": [float(NA), float(NB)], "p": [float(v) for v in s.x],
                         "payoff": [float(v) for v in s.payoffs],
                         "chosen": bool(frac == 1.0)})
    # Fee as a function of own capacity (holding rival at equilibrium): shows how capacity
    # commitments shape the price stage
    fee_curve = []
    hiA = cap_bounds(0, N)[1]
    for na in np.linspace(max(20.0, 0.4 * N[0]), min(hiA, 1.6 * N[0]), 17):
        s = sub.solve(float(na), N[1])
        fee_curve.append({"N_A": float(na), "p_A": float(s.x[0]), "p_B": float(s.x[1]),
                          "profit_A": float(s.payoffs[0])})

    extras = {"stage2_fees": [float(v) for v in p], "tree": tree, "fee_curve": fee_curve,
              "backward_induction": [
                  "Stage 2 (fees): for any capacity pair (N_A, N_B) the incentives are fixed by the "
                  "rider supply curve. Solve the fee-setting Nash equilibrium p*(N_A, N_B).",
                  "Stage 1 (capacity): each platform's reduced-form profit is pi_i(N, p*(N)). "
                  "Solve the capacity-stage Nash equilibrium of this reduced game.",
                  f"SPE: N = ({N[0]:.1f}, {N[1]:.1f}) riders, fees p = ({p[0]:.2f}, {p[1]:.2f}) INR.",
              ]}
    notes = [
        "Kreps-Scheinkman intuition: when capacity is chosen before prices, the price stage is "
        "softened (each platform knows the rival cannot serve unlimited demand without congesting), "
        "so outcomes resemble capacity (Cournot) competition rather than cut-throat Bertrand.",
    ]
    if cournot is not None:
        cN = [cournot["equilibrium"]["A"], cournot["equilibrium"]["B"]]
        extras["cournot_capacity"] = cN
        extras["cournot_profit"] = cournot["outcome"]["profit"]
        diff = N[0] - cN[0]
        notes.append(f"SPE capacity {N[0]:.1f} vs Cournot {cN[0]:.1f} riders "
                     f"({diff:+.1f}). Fees rise to {p[0]:.1f} INR vs the fixed {env.P.p:g} INR in Cournot, "
                     "so platforms trade some customers for less congestion and higher margins.")
    conv = ne1.info()
    conv["stage2_converged"] = stage2.converged
    return package("two_stage", "Two-stage (capacity, then fees)", scenario, env, out, "N", N,
                   verification, conv, brc, notes, extras)
