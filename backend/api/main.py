"""FastAPI application: thin HTTP layer over the engine. All model math lives in engine/ and
simulation/; responses are cached in memory keyed by the full request (config + options)."""
from __future__ import annotations

import csv
import io
import math
import os
import threading
from contextlib import asynccontextmanager
from typing import Any, Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from engine import registry
from engine.bayesian import solve_bayesian
from engine.config import build_config, config_key, load_defaults
from engine.insights import generate as generate_insights
from engine.matrix_game import analyze, market_matrix
from engine.repeated import solve_repeated
from engine.sensitivity import PARAMS as SENS_PARAMS
from engine.sensitivity import sweep
from simulation.runner import run_simulation, validate_scenarios

@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("RRR_PREWARM", "1") == "1":
        threading.Thread(target=_prewarm, daemon=True).start()
    yield


app = FastAPI(title="Riders, Rivals and Rush Hours API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_cache: dict = {}
_cache_lock = threading.Lock()
_key_locks: dict = {}

PARAM_META = {
    "R": {"label": "Rider pool R", "min": 100, "max": 1000, "step": 10, "unit": "riders"},
    "w0": {"label": "Reservation incentive w0", "min": 5, "max": 50, "step": 1, "unit": "INR/order"},
    "beta": {"label": "Rider sensitivity beta", "min": 0.02, "max": 0.5, "step": 0.01, "unit": "1/INR"},
    "k": {"label": "Orders per rider-hour k", "min": 1.0, "max": 4.0, "step": 0.1, "unit": "orders/h"},
    "rho_max": {"label": "Utilisation cap rho_max", "min": 0.8, "max": 0.99, "step": 0.01, "unit": ""},
    "d0": {"label": "Base delay d0", "min": 15, "max": 45, "step": 1, "unit": "min"},
    "s": {"label": "Congestion scale s", "min": 1, "max": 15, "step": 0.5, "unit": "min"},
    "a_A": {"label": "Attractiveness a_A", "min": 2.0, "max": 6.0, "step": 0.1, "unit": ""},
    "a_B": {"label": "Attractiveness a_B", "min": 2.0, "max": 6.0, "step": 0.1, "unit": ""},
    "b": {"label": "Fee sensitivity b", "min": 0.01, "max": 0.15, "step": 0.005, "unit": "1/INR"},
    "c": {"label": "Delay sensitivity c", "min": 0.02, "max": 0.2, "step": 0.005, "unit": "1/min"},
    "m": {"label": "Restaurant commission m", "min": 20, "max": 80, "step": 1, "unit": "INR/order"},
    "p": {"label": "Fixed delivery fee p", "min": 10, "max": 80, "step": 1, "unit": "INR/order"},
    "F_A": {"label": "Fixed cost F_A", "min": 0, "max": 10000, "step": 100, "unit": "INR/h"},
    "F_B": {"label": "Fixed cost F_B", "min": 0, "max": 10000, "step": 100, "unit": "INR/h"},
    "delay_cost": {"label": "Social cost of delay", "min": 0, "max": 10, "step": 0.1, "unit": "INR/min"},
}


# ------------------------------------------------------------------ helpers
def clean(obj: Any) -> Any:
    """Make numpy / non-finite values JSON-safe."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return f if math.isfinite(f) else None
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return clean(obj.tolist())
    return obj


def cfg_from(params: dict | None) -> dict:
    defaults = load_defaults()
    for section, values in (params or {}).items():
        if section not in defaults:
            raise HTTPException(422, f"unknown config section '{section}'")
        if isinstance(values, dict) and isinstance(defaults[section], dict) and section != "scenarios":
            unknown = set(values) - set(defaults[section])
            if unknown:
                raise HTTPException(422, f"unknown parameter(s) in '{section}': {sorted(unknown)}")
    return build_config(params)


def cached(key_parts: tuple, fn):
    """Memoise a response; concurrent identical requests wait for one computation."""
    key = config_key(*key_parts)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
        key_lock = _key_locks.setdefault(key, threading.Lock())
    with key_lock:
        with _cache_lock:
            if key in _cache:
                return _cache[key]
        value = clean(fn())
        with _cache_lock:
            _cache[key] = value
    return value


def scenario_or_404(cfg: dict, scenario):
    if isinstance(scenario, str) and scenario not in cfg["scenarios"]:
        try:
            return float(scenario)
        except ValueError:
            raise HTTPException(404, f"unknown scenario '{scenario}'")
    return scenario


# ------------------------------------------------------------------ request models
class Base(BaseModel):
    params: dict | None = Field(default=None, description="Config overrides, e.g. {'market': {'beta': 0.2}}")


class SolveReq(Base):
    scenario: str = "Medium"
    curves: bool = True


class MatrixReq(Base):
    scenario: str = "Medium"
    levels: list[float] | None = None


class CustomMatrixReq(BaseModel):
    payoff_row: list[list[float]]
    payoff_col: list[list[float]]
    row_labels: list[str] | None = None
    col_labels: list[str] | None = None


class RepeatedReq(Base):
    scenario: str = "Medium"
    delta: float | None = Field(default=None, ge=0, lt=1)
    noise: float | None = Field(default=None, ge=0, le=0.5)
    T: int | None = Field(default=None, ge=2, le=500)
    generosity: float | None = Field(default=None, ge=0, le=1)


class BayesReq(Base):
    scenario: str = "Peak"
    prior_high: float | None = Field(default=None, ge=0, le=1)
    a_shift: float | None = Field(default=None, ge=0, le=1.5)


class SimReq(Base):
    scenario: str = "Peak"
    model: str | None = None
    seed: int | None = None
    mc_runs: int | None = Field(default=None, ge=0, le=50)


class ValidateReq(Base):
    model: str | None = None
    runs: int = Field(default=10, ge=1, le=40)


class SensReq(Base):
    param: str = "beta"
    values: list[float] | None = None
    points: int = Field(default=9, ge=3, le=25)
    scenario: str = "Peak"
    models: list[str] | None = None


class ExportReq(Base):
    kind: Literal["compare", "sensitivity", "simulation", "repeated"] = "compare"
    options: dict | None = None


# ------------------------------------------------------------------ endpoints
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def get_config():
    d = load_defaults()
    return clean({"defaults": d, "param_meta": PARAM_META, "scenarios": d["scenarios"],
                  "models": [{"id": k, **v} for k, v in registry.MODEL_INFO.items()],
                  "comparison_models": registry.COMPARISON_MODELS,
                  "sensitivity_params": {k: {"label": v["label"], "range": v["range"]} for k, v in SENS_PARAMS.items()}})


@app.post("/api/solve/{model}")
def solve_model(model: str, req: SolveReq):
    if model not in registry.MODEL_INFO:
        raise HTTPException(404, f"unknown model '{model}'")
    cfg = cfg_from(req.params)
    scenario = scenario_or_404(cfg, req.scenario)
    return cached(("solve", model, cfg, scenario, req.curves),
                  lambda: registry.solve(model, cfg, scenario, curves=req.curves))


@app.post("/api/compare")
def compare(req: Base):
    cfg = cfg_from(req.params)
    return cached(("compare", cfg), lambda: registry.compare(cfg))


@app.post("/api/matrix-game")
def matrix_game(req: MatrixReq):
    cfg = cfg_from(req.params)
    scenario = scenario_or_404(cfg, req.scenario)
    return cached(("matrix", cfg, scenario, req.levels), lambda: market_matrix(cfg, scenario, req.levels))


@app.post("/api/matrix-game/custom")
def matrix_custom(req: CustomMatrixReq):
    A, B = np.array(req.payoff_row, float), np.array(req.payoff_col, float)
    if A.shape != B.shape or A.ndim != 2 or min(A.shape) < 1 or max(A.shape) > 6:
        raise HTTPException(422, "payoff matrices must have the same shape (at most 6x6)")
    rl = req.row_labels or [f"R{i + 1}" for i in range(A.shape[0])]
    cl = req.col_labels or [f"C{j + 1}" for j in range(A.shape[1])]
    return clean(analyze(A, B, rl, cl))


@app.post("/api/repeated")
def repeated(req: RepeatedReq):
    cfg = cfg_from(req.params)
    scenario = scenario_or_404(cfg, req.scenario)
    rc = cfg["repeated"]
    delta = rc["delta"] if req.delta is None else req.delta
    noise = rc["noise"] if req.noise is None else req.noise
    T = rc["T"] if req.T is None else req.T
    gen = rc["generosity"] if req.generosity is None else req.generosity
    return cached(("repeated", cfg, scenario, delta, noise, T, gen),
                  lambda: solve_repeated(cfg, scenario, delta, noise, T, gen))


@app.post("/api/bayesian")
def bayesian(req: BayesReq):
    cfg = cfg_from(req.params)
    scenario = scenario_or_404(cfg, req.scenario)
    bc = cfg["bayesian"]
    q = bc["prior_high"] if req.prior_high is None else req.prior_high
    shift = bc["a_shift"] if req.a_shift is None else req.a_shift
    return cached(("bayes", cfg, scenario, q, shift), lambda: solve_bayesian(cfg, scenario, q, shift))


@app.post("/api/simulate")
def simulate(req: SimReq):
    cfg = cfg_from(req.params)
    scenario = scenario_or_404(cfg, req.scenario)
    if req.model and req.model not in registry.MODEL_INFO:
        raise HTTPException(404, f"unknown model '{req.model}'")
    sc = cfg["simulation"]
    model = req.model or sc["model"]
    seed = sc["seed"] if req.seed is None else req.seed
    runs = sc["mc_runs"] if req.mc_runs is None else req.mc_runs
    return cached(("sim", cfg, scenario, model, seed, runs), lambda: run_simulation(cfg, scenario, model, seed, runs))


@app.post("/api/simulate/validate")
def simulate_validate(req: ValidateReq):
    cfg = cfg_from(req.params)
    model = req.model or cfg["simulation"]["model"]
    return cached(("validate", cfg, model, req.runs), lambda: validate_scenarios(cfg, model, req.runs))


@app.post("/api/sensitivity")
def sensitivity(req: SensReq):
    cfg = cfg_from(req.params)
    if req.param not in SENS_PARAMS:
        raise HTTPException(404, f"unknown parameter '{req.param}'")
    models = req.models or None
    if models and any(m not in registry.MODEL_INFO for m in models):
        raise HTTPException(404, "unknown model in 'models'")
    return cached(("sens", cfg, req.param, req.values, req.points, req.scenario, models),
                  lambda: sweep(cfg, req.param, req.values, req.scenario, models, req.points))


@app.post("/api/insights")
def insights(req: Base):
    cfg = cfg_from(req.params)
    return cached(("insights", cfg), lambda: generate_insights(cfg))


def _csv(rows: list[dict]) -> str:
    if not rows:
        return ""
    buf = io.StringIO()
    keys = list(rows[0].keys())
    for r in rows[1:]:
        keys += [k for k in r if k not in keys]
    w = csv.DictWriter(buf, fieldnames=keys)
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k) for k in keys})
    return buf.getvalue()


@app.post("/api/export", response_class=PlainTextResponse)
def export(req: ExportReq):
    cfg = cfg_from(req.params)
    opt = req.options or {}
    if req.kind == "compare":
        rows = compare(Base(params=req.params))["rows"]
    elif req.kind == "sensitivity":
        rows = sensitivity(SensReq(params=req.params, **opt))["rows"]
    elif req.kind == "simulation":
        rows = simulate(SimReq(params=req.params, **opt))["per_minute"]
    else:
        rows = repeated(RepeatedReq(params=req.params, **opt))["tournament"]["ranking"]
    name = f"{req.kind}.csv"
    return PlainTextResponse(_csv(rows), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/export", response_class=PlainTextResponse)
def export_default(kind: Literal["compare", "sensitivity", "simulation", "repeated"] = "compare"):
    return export(ExportReq(kind=kind))


@app.exception_handler(ValueError)
def value_error(_, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


def _prewarm():
    """Fill the cache for the default configuration in the background so the first page loads fast."""
    try:
        compare(Base())
        insights(Base())
        for s in ("Low", "Medium", "Peak", "Extreme"):
            for m in ("cournot", "bertrand_incentive", "bertrand_fee", "two_stage"):
                solve_model(m, SolveReq(scenario=s))
            matrix_game(MatrixReq(scenario=s))
            repeated(RepeatedReq(scenario=s))
        simulate(SimReq(scenario="Peak"))
        simulate_validate(ValidateReq())
    except Exception as exc:  # pragma: no cover
        print("prewarm failed:", exc)

