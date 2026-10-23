"""Stackelberg leadership: Platform A commits first (to N_A or to w_A), B observes and
best-responds. Solved by backward induction: numerical optimisation over the leader's choice
with the follower's best response computed inside."""
from __future__ import annotations

import numpy as np

from .bertrand import incentive_game
from .common import deviation_kw, make_env, package
from .cournot import capacity_game
from .solvers import deviation_check, leader_check, stackelberg


def _tree(st: dict, x_leader: float, lo: float, hi: float, n: int = 5) -> list:
    """A handful of representative leader commitments (incl. the optimum) for the game tree."""
    xs = sorted(set([float(v) for v in np.linspace(lo + 0.1 * (hi - lo), hi - 0.25 * (hi - lo), n - 1)]
                    + [float(x_leader)]))
    nodes = []
    for xl in xs:
        xf = st["follower_br"](xl)
        nodes.append({"leader": xl, "follower": xf, "chosen": abs(xl - x_leader) < 1e-9})
    return nodes


def solve_stackelberg(cfg: dict, scenario, variable: str = "N", simultaneous: dict | None = None) -> dict:
    env = make_env(cfg, scenario)
    if variable == "N":
        payoff, bounds = capacity_game(env, cfg)
        model, label, sim_label = "stackelberg_capacity", "Stackelberg (capacity)", "Cournot"
    else:
        payoff, bounds = incentive_game(env, cfg)
        model, label, sim_label = "stackelberg_incentive", "Stackelberg (incentives)", "Bertrand (incentives)"

    grid = cfg["solver"]["br_grid"]
    st = stackelberg(payoff, bounds, leader=0, grid=grid, follower_grid=grid)
    x = st["x"]
    lo, hi = st["bounds"]
    lcheck = leader_check(st["leader_value"], x[0], lo, hi,
                          tol_rel=cfg["solver"]["deviation_tol_rel"],
                          tol_abs=cfg["solver"]["deviation_tol_abs"])
    fcheck = deviation_check(payoff, x, bounds, players_to_check=(1,), **deviation_kw(cfg))
    verification = {"passed": bool(lcheck["passed"] and fcheck["passed"]),
                    "leader": lcheck, "players": fcheck["players"],
                    "grid_points": fcheck["grid_points"]}
    out = env.evaluate(NA=x[0], NB=x[1]) if variable == "N" else env.evaluate(wA=x[0], wB=x[1])

    # leader's payoff as a function of its commitment (with the follower's reaction inside)
    curve = []
    for xl in np.linspace(lo, hi if variable != "N" else min(hi, 0.8 * env.P.R), 41):
        xf = st["follower_br"](float(xl))
        curve.append({"leader": float(xl), "follower": float(xf),
                      "leader_payoff": float(st["leader_value"](float(xl)))})
    tree = []
    for node in _tree(st, x[0], lo, min(hi, 0.8 * env.P.R) if variable == "N" else hi):
        prof = payoff(0, [node["leader"], node["follower"]]), payoff(1, [node["leader"], node["follower"]])
        tree.append({**node, "payoff_leader": float(prof[0]), "payoff_follower": float(prof[1])})

    extras = {"leader_curve": curve, "tree": tree, "simultaneous_model": sim_label}
    notes = []
    if simultaneous is not None:
        sim = simultaneous["outcome"]
        fma = out["profit"][0] - sim["profit"][0]
        extras.update({
            "first_mover_advantage": fma,
            "follower_change": out["profit"][1] - sim["profit"][1],
            "simultaneous_profit": sim["profit"],
            "simultaneous_equilibrium": simultaneous["equilibrium"],
        })
        verdict = "helps" if fma > 0 else "hurts"
        notes.append(f"Moving first {verdict} Platform A: its profit changes by {fma:,.0f} INR/hour "
                     f"relative to the simultaneous {sim_label} equilibrium.")
    if variable == "N":
        notes.append("Capacities are strategic substitutes here: by committing to a larger fleet the "
                     "leader makes riders scarcer for the follower, who then hires fewer.")
    else:
        notes.append("Incentives are strategic complements here: the follower matches a high "
                     "incentive, so the leader's commitment to a moderate incentive softens the war.")
    steps = [
        "Step 1 (stage 2, follower): for every possible commitment of A, compute B's best response.",
        "Step 2 (stage 1, leader): substitute B's reaction into A's profit, giving A's profit as a "
        "function of its own commitment only.",
        f"Step 3: A picks the commitment that maximises that function: {x[0]:.2f}. "
        f"B responds with {x[1]:.2f}.",
    ]
    extras["backward_induction"] = steps
    return package(model, label, scenario, env, out, variable, x, verification,
                   {"converged": True, "iterations": 1}, None, notes, extras)
