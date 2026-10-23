"""Model registry, in-memory result cache, efficiency / price of anarchy, cross-model comparison."""
from __future__ import annotations

import threading
from concurrent.futures import ProcessPoolExecutor

from .bertrand import solve_bertrand_fee, solve_bertrand_incentive
from .config import build_config, config_key
from .cournot import solve_cournot
from .planner import solve_collusion, solve_planner
from .stackelberg import solve_stackelberg
from .two_stage import solve_two_stage

MODEL_INFO = {
    "cournot": {"label": "Cournot (capacity)", "variable": "N", "timing": "simultaneous", "module": 1},
    "bertrand_incentive": {"label": "Bertrand (incentives)", "variable": "w", "timing": "simultaneous", "module": 1},
    "bertrand_fee": {"label": "Bertrand (fees)", "variable": "p", "timing": "simultaneous", "module": 1},
    "bertrand_homogeneous": {"label": "Homogeneous Bertrand", "variable": "w", "timing": "simultaneous", "module": 1},
    "stackelberg_capacity": {"label": "Stackelberg (capacity)", "variable": "N", "timing": "sequential", "module": 4},
    "stackelberg_incentive": {"label": "Stackelberg (incentives)", "variable": "w", "timing": "sequential", "module": 4},
    "two_stage": {"label": "Two-stage (capacity then fees)", "variable": "N", "timing": "sequential", "module": 4},
    "collusion": {"label": "Collusion (joint profit)", "variable": "w", "timing": "benchmark", "module": 7},
    "planner": {"label": "Social planner", "variable": "w", "timing": "benchmark", "module": 1},
}
COMPARISON_MODELS = ["cournot", "bertrand_incentive", "bertrand_fee", "stackelberg_capacity",
                     "stackelberg_incentive", "two_stage", "collusion", "planner"]

_cache: dict = {}
_lock = threading.Lock()


def _get(key):
    with _lock:
        return _cache.get(key)


def _put(key, value):
    with _lock:
        _cache[key] = value
    return value


def clear_cache():
    with _lock:
        _cache.clear()


def _raw(model: str, cfg: dict, scenario, curves: bool) -> dict:
    key = ("raw", model, config_key(cfg), str(scenario), curves)
    hit = _get(key)
    if hit is not None:
        return hit
    if model == "cournot":
        res = solve_cournot(cfg, scenario, curves)
    elif model == "bertrand_incentive":
        res = solve_bertrand_incentive(cfg, scenario, curves)
    elif model == "bertrand_homogeneous":
        res = solve_bertrand_incentive(cfg, scenario, curves, homogeneous=True)
    elif model == "bertrand_fee":
        res = solve_bertrand_fee(cfg, scenario, curves)
    elif model == "stackelberg_capacity":
        res = solve_stackelberg(cfg, scenario, "N", _raw("cournot", cfg, scenario, False))
    elif model == "stackelberg_incentive":
        res = solve_stackelberg(cfg, scenario, "w", _raw("bertrand_incentive", cfg, scenario, False))
    elif model == "two_stage":
        res = solve_two_stage(cfg, scenario, _raw("cournot", cfg, scenario, False), curves)
    elif model == "collusion":
        res = solve_collusion(cfg, scenario)
    elif model == "planner":
        res = solve_planner(cfg, scenario)
    else:
        raise KeyError(f"unknown model '{model}'")
    return _put(key, res)


def solve(model: str, cfg: dict | None = None, scenario="Medium", curves: bool = True) -> dict:
    """Solve one model and attach efficiency metrics relative to the social planner."""
    cfg = cfg or build_config()
    if model not in MODEL_INFO:
        raise KeyError(f"unknown model '{model}'")
    # sequential/benchmark models never produce BR curves; share one cache entry
    curves = curves and model in ("cournot", "bertrand_incentive", "bertrand_fee",
                                  "bertrand_homogeneous", "two_stage")
    res = dict(_raw(model, cfg, scenario, curves))
    out = dict(res["outcome"])
    W_planner = _raw("planner", cfg, scenario, False)["outcome"]["total_welfare"]
    if model == "bertrand_homogeneous":
        out["efficiency"] = None
        out["price_of_anarchy"] = None
    else:
        out["efficiency"] = out["total_welfare"] / W_planner if W_planner > 0 else None
        out["price_of_anarchy"] = W_planner / out["total_welfare"] if out["total_welfare"] > 0 else None
    out["planner_welfare"] = W_planner
    res["outcome"] = out
    res["info"] = MODEL_INFO[model]
    return res


def _solve_scenario(args):
    cfg, scenario = args
    return scenario, {m: solve(m, cfg, scenario, curves=False) for m in COMPARISON_MODELS}


METRICS = [
    ("avg_delay", "Average delay", "min"),
    ("total_completed", "Orders completed", "orders/h"),
    ("total_profit", "Platform profit", "INR/h"),
    ("total_incentive_spend", "Incentive spend", "INR/h"),
    ("efficiency", "Efficiency", "W / W*"),
    ("total_welfare", "Total welfare", "INR/h"),
    ("consumer_surplus", "Consumer surplus", "INR/h"),
    ("rider_surplus", "Rider surplus", "INR/h"),
    ("total_unserved", "Unserved orders", "orders/h"),
]


def row_from(res: dict) -> dict:
    o = res["outcome"]
    row = {"model": res["model"], "label": res["label"], "scenario": res["scenario"],
           "demand_rate": res["demand_rate"], "variable": res["strategy_variable"]["symbol"],
           "strategy_A": res["equilibrium"]["A"], "strategy_B": res["equilibrium"]["B"],
           "verified": res["verification"].get("passed")}
    for key, _, _ in METRICS:
        row[key] = o.get(key)
    for key in ("w", "p", "N", "delay", "completed", "profit", "incentive_spend", "rho"):
        row[f"{key}_A"], row[f"{key}_B"] = o[key][0], o[key][1]
    row["price_of_anarchy"] = o.get("price_of_anarchy")
    return row


def compare(cfg: dict | None = None, parallel: bool = True) -> dict:
    cfg = cfg or build_config()
    key = ("compare", config_key(cfg))
    hit = _get(key)
    if hit is not None:
        return hit
    scenarios = list(cfg["scenarios"])
    results: dict = {}
    pending = [s for s in scenarios
               if _get(("raw", "two_stage", config_key(cfg), s, False)) is None]
    if parallel and len(pending) > 1:
        try:
            with ProcessPoolExecutor(max_workers=min(4, len(pending))) as ex:
                for scenario, by_model in ex.map(_solve_scenario, [(cfg, s) for s in pending]):
                    results[scenario] = by_model
                    for m, r in by_model.items():
                        stripped = {k: v for k, v in r.items() if k != "info"}
                        o = dict(stripped["outcome"])
                        for extra in ("efficiency", "price_of_anarchy", "planner_welfare"):
                            o.pop(extra, None)
                        stripped["outcome"] = o
                        _put(("raw", m, config_key(cfg), scenario, False), stripped)
        except Exception:  # pragma: no cover - fall back to serial (e.g. restricted environments)
            results = {}
    for s in scenarios:
        if s not in results:
            results[s] = _solve_scenario((cfg, s))[1]
    rows = [row_from(results[s][m]) for s in scenarios for m in COMPARISON_MODELS]
    heat = [[results[s][m]["outcome"]["efficiency"] for s in scenarios] for m in COMPARISON_MODELS]
    payload = {
        "scenarios": scenarios,
        "demand": {s: cfg["scenarios"][s] for s in scenarios},
        "models": [{"id": m, **MODEL_INFO[m]} for m in COMPARISON_MODELS],
        "metrics": [{"key": k, "label": l, "unit": u} for k, l, u in METRICS],
        "rows": rows,
        "efficiency_heatmap": {"models": COMPARISON_MODELS, "scenarios": scenarios, "values": heat},
        "all_verified": all(r["verified"] for r in rows),
    }
    return _put(key, payload)
