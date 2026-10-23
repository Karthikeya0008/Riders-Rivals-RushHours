"""Helpers shared by the game models: environment construction, strategy bounds, result packaging."""
from __future__ import annotations

from .config import MarketParams
from .market import MarketEnvironment

STRATEGY_VARS = {
    "N": {"symbol": "N", "name": "Riders hired (capacity)", "unit": "riders"},
    "w": {"symbol": "w", "name": "Rider incentive per order", "unit": "INR/order"},
    "p": {"symbol": "p", "name": "Customer delivery fee", "unit": "INR/order"},
}


def resolve_demand(cfg: dict, scenario) -> float:
    if isinstance(scenario, str) and scenario in cfg["scenarios"]:
        return float(cfg["scenarios"][scenario])
    return float(scenario)


def make_env(cfg: dict, scenario, **param_changes) -> MarketEnvironment:
    params = MarketParams.from_config(cfg)
    if param_changes:
        params = params.with_(**param_changes)
    s = cfg["solver"]
    return MarketEnvironment(params, resolve_demand(cfg, scenario), tol=s["fp_tol"], max_iter=s["fp_max_iter"])


def capacity_bounds(env: MarketEnvironment, cfg: dict):
    """N_i must leave at least N_min riders for the rival and N0_min riders offline."""
    b = cfg["bounds"]
    R = env.P.R

    def bounds(i, x):
        rival = max(x[1 - i], b["N_min"])
        return b["N_min"], max(b["N_min"], R - rival - b["N0_min"])
    return bounds


def const_bounds(lo_hi):
    lo, hi = float(lo_hi[0]), float(lo_hi[1])
    return lambda i, x: (lo, hi)


def capacity_plot_range(env: MarketEnvironment, cfg: dict) -> tuple:
    return (cfg["bounds"]["N_min"], 0.75 * env.P.R)


def solver_kw(cfg: dict) -> dict:
    s = cfg["solver"]
    return {"grid": s["br_grid"], "max_iter": s["br_max_iter"], "tol": s["br_tol"]}


def deviation_kw(cfg: dict) -> dict:
    s = cfg["solver"]
    return {"grid": s["deviation_grid"], "tol_rel": s["deviation_tol_rel"], "tol_abs": s["deviation_tol_abs"]}


def package(model: str, label: str, scenario, env: MarketEnvironment, outcome: dict,
            variable: str, equilibrium: list, verification: dict, convergence: dict | None = None,
            br_curves: dict | None = None, notes: list | None = None, extras: dict | None = None) -> dict:
    return {
        "model": model,
        "label": label,
        "scenario": scenario,
        "demand_rate": env.L,
        "strategy_variable": STRATEGY_VARS[variable],
        "equilibrium": {"A": float(equilibrium[0]), "B": float(equilibrium[1])},
        "outcome": outcome,
        "verification": verification,
        "convergence": convergence or {},
        "br_curves": br_curves,
        "notes": notes or [],
        "extras": extras or {},
    }
