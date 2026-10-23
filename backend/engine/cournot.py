"""Cournot capacity competition: each platform chooses its rider count N_i; incentives follow
from the inverse rider supply w_i = w0 + (1/beta) ln(N_i / N_0); fees fixed at p."""
from __future__ import annotations

from .common import (capacity_bounds, capacity_plot_range, deviation_kw, make_env, package,
                     solver_kw)
from .solvers import br_curves, deviation_check, nash_br_iteration


def capacity_game(env, cfg):
    def payoff(i, x):
        return env.profits(NA=x[0], NB=x[1])[i]
    return payoff, capacity_bounds(env, cfg)


def solve_cournot(cfg: dict, scenario, curves: bool = True) -> dict:
    env = make_env(cfg, scenario)
    payoff, bounds = capacity_game(env, cfg)
    R = env.P.R
    ne = nash_br_iteration(payoff, bounds, [R / 3, R / 3], **solver_kw(cfg))
    check = deviation_check(payoff, ne.x, bounds, **deviation_kw(cfg))
    out = env.evaluate(NA=ne.x[0], NB=ne.x[1])
    rng = capacity_plot_range(env, cfg)
    brc = br_curves(payoff, bounds, (rng, rng), cfg["solver"]["curve_points"]) if curves else None
    notes = [
        "Each platform hires riders N_i; the incentive needed is read off the shared rider supply curve.",
        "Hiring one more rider raises the incentive a platform must pay on every order and also "
        "raises the rival's required incentive (it shrinks the outside pool N_0).",
    ]
    return package("cournot", "Cournot (capacity)", scenario, env, out, "N", ne.x, check,
                   ne.info(), brc, notes)
