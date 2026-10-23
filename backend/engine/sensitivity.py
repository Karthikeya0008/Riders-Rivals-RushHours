"""One-parameter sensitivity sweeps: re-solve selected models while varying beta, c, k, R or
Lambda (or any other market parameter), holding everything else at its configured value."""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor

import numpy as np

from .config import config_key, deep_merge
from .registry import _get, _put, solve

PARAMS = {
    "beta": {"label": "Rider incentive sensitivity beta", "range": [0.05, 0.4], "path": "market"},
    "c": {"label": "Customer delay sensitivity c", "range": [0.02, 0.16], "path": "market"},
    "k": {"label": "Orders per rider-hour k", "range": [1.4, 3.4], "path": "market"},
    "R": {"label": "Rider pool size R", "range": [250, 900], "path": "market"},
    "Lambda": {"label": "Total demand Lambda (orders/h)", "range": [400, 2400], "path": None},
    "w0": {"label": "Reservation incentive w0", "range": [10, 45], "path": "market"},
    "b": {"label": "Customer fee sensitivity b", "range": [0.03, 0.09], "path": "market"},
    "s": {"label": "Congestion scale s", "range": [2, 12], "path": "market"},
}
DEFAULT_MODELS = ["cournot", "bertrand_incentive", "stackelberg_capacity", "collusion", "planner"]
METRIC_KEYS = ["avg_delay", "total_completed", "total_profit", "total_incentive_spend", "efficiency",
               "total_welfare", "consumer_surplus", "rider_surplus"]


def _point(args):
    cfg, param, value, scenario, models = args
    if param == "Lambda":
        sub, scen = cfg, float(value)
    else:
        v = int(round(value)) if param == "R" else float(value)
        sub, scen = deep_merge(cfg, {"market": {param: v}}), scenario
    row = {"value": float(value)}
    for m in models:
        o = solve(m, sub, scen, curves=False)
        oc = o["outcome"]
        for k in METRIC_KEYS:
            row[f"{m}__{k}"] = oc.get(k)
        row[f"{m}__strategy_A"] = o["equilibrium"]["A"]
        row[f"{m}__w_A"] = oc["w"][0]
        row[f"{m}__N_A"] = oc["N"][0]
        row[f"{m}__verified"] = o["verification"].get("passed")
    return row


def sweep(cfg: dict, param: str, values: list | None = None, scenario="Peak",
          models: list | None = None, points: int = 9, parallel: bool = True) -> dict:
    if param not in PARAMS:
        raise KeyError(f"unknown sensitivity parameter '{param}'")
    models = models or DEFAULT_MODELS
    if not values:
        lo, hi = PARAMS[param]["range"]
        values = np.linspace(lo, hi, points).tolist()
    key = ("sens", config_key(cfg), param, tuple(round(v, 6) for v in values), str(scenario), tuple(models))
    hit = _get(key)
    if hit is not None:
        return hit
    jobs = [(cfg, param, v, scenario, models) for v in values]
    rows = None
    if parallel and len(jobs) > 2:
        try:
            with ProcessPoolExecutor(max_workers=4) as ex:
                rows = list(ex.map(_point, jobs))
        except Exception:  # pragma: no cover - restricted environments
            rows = None
    if rows is None:
        rows = [_point(j) for j in jobs]
    base = cfg["scenarios"].get(scenario) if param == "Lambda" else cfg["market"].get(param)
    payload = {"param": param, "label": PARAMS[param]["label"], "scenario": scenario,
               "baseline": base, "models": models, "metrics": METRIC_KEYS, "rows": rows,
               "all_verified": all(r[f"{m}__verified"] for r in rows for m in models)}
    return _put(key, payload)
