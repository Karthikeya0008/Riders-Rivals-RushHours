"""Bayesian Cournot (incomplete information).

Each platform privately learns whether its own demand is High or Low: its attractiveness is
a_i + shift (High) or a_i - shift (Low), independently with prior P(High) = q. Each platform
chooses a type-contingent capacity N_i(theta_i) to maximise expected profit over the rival's
unknown type. The Bayesian Nash equilibrium is computed by best-response iteration over the
four type-contingent strategies, and verified per (player, type) on a fine grid.
"""
from __future__ import annotations

import numpy as np

from .common import make_env
from .solvers import best_response

TYPES = ("H", "L")


def bayesian_br_iteration(exp_payoff, bounds, x0: dict, grid: int = 61, max_iter: int = 200,
                          tol: float = 1e-5) -> tuple[dict, bool, int]:
    """Generic BNE solver. Strategies are a dict {(player, type): action}.

    exp_payoff(player, type, action, strategies) -> expected payoff of that type
    bounds(player, strategies) -> (lo, hi)"""
    s = dict(x0)
    for it in range(1, max_iter + 1):
        old = dict(s)
        for key in list(s):
            i, ti = key
            lo, hi = bounds(i, s)
            s[key], _ = best_response(lambda a: exp_payoff(i, ti, a, s), lo, hi, grid)
        if max(abs(s[k] - old[k]) for k in s) < tol:
            return s, True, it
    return s, False, max_iter


def bayesian_check(exp_payoff, bounds, s: dict, grid: int = 401, tol_rel: float = 1e-3,
                   tol_abs: float = 1.0) -> dict:
    rows = []
    for (i, ti), a in s.items():
        lo, hi = bounds(i, s)
        eq = exp_payoff(i, ti, a, s)
        dev, val = best_response(lambda v: exp_payoff(i, ti, v, s), lo, hi, grid)
        tol = max(tol_abs, tol_rel * abs(eq))
        rows.append({"player": "AB"[i], "type": ti, "strategy": float(a), "payoff": float(eq),
                     "best_deviation": float(dev), "best_deviation_payoff": float(val),
                     "gain": float(val - eq), "tolerance": float(tol), "passed": bool(val - eq <= tol)})
    return {"passed": all(r["passed"] for r in rows), "grid_points": grid, "players": rows}


def solve_bayesian(cfg: dict, scenario, prior_high: float | None = None,
                   a_shift: float | None = None) -> dict:
    from .cournot import solve_cournot  # complete-information benchmark per type profile
    bc = cfg["bayesian"]
    q = bc["prior_high"] if prior_high is None else float(prior_high)
    shift = bc["a_shift"] if a_shift is None else float(a_shift)
    m = cfg["market"]
    a = {("A", "H"): m["a_A"] + shift, ("A", "L"): m["a_A"] - shift,
         ("B", "H"): m["a_B"] + shift, ("B", "L"): m["a_B"] - shift}
    prior = {"H": q, "L": 1 - q}
    envs = {(tA, tB): make_env(cfg, scenario, a_A=a[("A", tA)], a_B=a[("B", tB)])
            for tA in TYPES for tB in TYPES}
    b = cfg["bounds"]
    R = cfg["market"]["R"]

    def realized(i, ti, ai, tj, aj):
        tA, tB = (ti, tj) if i == 0 else (tj, ti)
        NA, NB = (ai, aj) if i == 0 else (aj, ai)
        return envs[(tA, tB)].profits(NA=NA, NB=NB)[i]

    def exp_payoff(i, ti, ai, s):
        j = 1 - i
        return sum(prior[tj] * realized(i, ti, ai, tj, s[(j, tj)]) for tj in TYPES if prior[tj] > 0)

    def bounds(i, s):
        j = 1 - i
        rival = max(max(s[(j, t)] for t in TYPES), b["N_min"])
        return b["N_min"], max(b["N_min"], R - rival - b["N0_min"])

    x0 = {(i, t): R / 3 for i in (0, 1) for t in TYPES}
    s, converged, iters = bayesian_br_iteration(exp_payoff, bounds, x0, grid=cfg["solver"]["br_grid"])
    check = bayesian_check(exp_payoff, bounds, s, grid=cfg["solver"]["deviation_grid"],
                           tol_rel=cfg["solver"]["deviation_tol_rel"],
                           tol_abs=cfg["solver"]["deviation_tol_abs"])

    profiles = []
    exp = {"profit": np.zeros(2), "delay": np.zeros(2), "completed": np.zeros(2), "welfare": 0.0}
    for tA in TYPES:
        for tB in TYPES:
            pr = prior[tA] * prior[tB]
            o = envs[(tA, tB)].evaluate(NA=s[(0, tA)], NB=s[(1, tB)])
            sub_cfg = {**cfg, "market": {**cfg["market"], "a_A": a[("A", tA)], "a_B": a[("B", tB)]}}
            ci = solve_cournot(sub_cfg, scenario, curves=False)
            profiles.append({
                "types": [tA, tB], "probability": pr,
                "N": [s[(0, tA)], s[(1, tB)]], "w": o["w"], "delay": o["delay"],
                "profit": o["profit"], "completed": o["completed"],
                "complete_info_N": [ci["equilibrium"]["A"], ci["equilibrium"]["B"]],
                "complete_info_profit": ci["outcome"]["profit"],
            })
            exp["profit"] += pr * np.array(o["profit"])
            exp["delay"] += pr * np.array(o["delay"])
            exp["completed"] += pr * np.array(o["completed"])
            exp["welfare"] += pr * o["total_welfare"]

    strategies = {"A": {"H": s[(0, "H")], "L": s[(0, "L")]}, "B": {"H": s[(1, "H")], "L": s[(1, "L")]}}
    exp_ci_profit = sum(p["probability"] * np.array(p["complete_info_profit"]) for p in profiles)
    return {
        "scenario": scenario, "prior_high": q, "a_shift": shift,
        "attractiveness": {f"{k[0]}_{k[1]}": v for k, v in a.items()},
        "strategies": strategies, "converged": converged, "iterations": iters,
        "verification": check, "profiles": profiles,
        "expected": {"profit": exp["profit"].tolist(), "delay": exp["delay"].tolist(),
                     "completed": exp["completed"].tolist(), "welfare": exp["welfare"],
                     "complete_info_profit": exp_ci_profit.tolist(),
                     "value_of_information": (exp_ci_profit - exp["profit"]).tolist()},
        "notes": [
            "A platform with a High demand shock hires more riders. Because it does not know the "
            "rival's type, it best-responds to the rival's *expected* capacity.",
            "Compared with complete information, each type over- or under-hires relative to what it "
            "would do if it saw the rival's type, which creates an ex-post regret.",
        ],
    }
