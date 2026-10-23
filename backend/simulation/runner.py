"""Run the agent-based simulation for a scenario (display run + Monte Carlo replications) and
compare simulated delays with the analytical delay function."""
from __future__ import annotations

import numpy as np

from engine.common import make_env, resolve_demand
from engine.registry import solve

from .abm import Simulation, _fit_delay_curve, error_metrics


def _ci(values) -> dict:
    v = np.asarray([x for x in values if x is not None], float)
    if len(v) == 0:
        return {"mean": None, "lo": None, "hi": None, "sd": None, "n": 0}
    sd = float(v.std(ddof=1)) if len(v) > 1 else 0.0
    half = 1.96 * sd / np.sqrt(len(v)) if len(v) > 1 else 0.0
    return {"mean": float(v.mean()), "lo": float(v.mean() - half), "hi": float(v.mean() + half),
            "sd": sd, "n": int(len(v))}


def _equilibrium(cfg, scenario, model):
    res = solve(model, cfg, scenario, curves=False)
    o = res["outcome"]
    return res, {"w": o["w"], "p": o["p"], "delay": o["delay"], "N": o["N"], "demand": o["demand"]}


def attach_analytic(cfg: dict, eq: dict, out: dict) -> dict:
    """Quasi-static analytical benchmark: for every minute, solve the demand-delay fixed point of
    the analytical model at that minute's arrival rate Lambda(t), holding the equilibrium
    incentives and fees fixed. Adds `analytic_delay_A/B` to each minute and order-weighted means
    to the summary."""
    cache: dict = {}
    for r in out["per_minute"]:
        lam = round(r["lambda_total"], 3)
        if lam not in cache:
            o = make_env(cfg, lam).evaluate(wA=eq["w"][0], wB=eq["w"][1], pA=eq["p"][0], pB=eq["p"][1])
            cache[lam] = o["delay"]
        r["analytic_delay_A"], r["analytic_delay_B"] = cache[lam]
    for idx, name in enumerate(("A", "B")):
        w = np.array([r[f"orders_{name}"] for r in out["per_minute"]], float)
        a = np.array([r[f"analytic_delay_{name}"] for r in out["per_minute"]], float)
        out["summary"][name]["analytic_mean_delay"] = float((w * a).sum() / w.sum()) if w.sum() else None
    return out


def _run(sc, cfg, eq, demand, seed, frames):
    out = Simulation(sc, cfg["market"], eq, demand, seed, record_frames=frames).run()
    return attach_analytic(cfg, eq, out)


def monte_carlo(cfg: dict, scenario, model: str, runs: int, seed0: int) -> dict:
    sc = cfg["simulation"]
    _, eq = _equilibrium(cfg, scenario, model)
    demand = resolve_demand(cfg, scenario)
    summaries, curves, errors = [], [], []
    rhos, delays = [], []
    for k in range(runs):
        out = _run(sc, cfg, eq, demand, seed0 + 1 + k, False)
        summaries.append(out["summary"])
        errors.append(error_metrics(out["per_minute"]))
        curves.append(out["per_minute"])
        for r in out["per_minute"]:
            for name in ("A", "B"):
                if r[f"sim_delay_{name}"] is not None and r[f"rho_{name}"] is not None:
                    rhos.append(r[f"rho_{name}"])
                    delays.append(r[f"sim_delay_{name}"])
    W = len(curves[0]) if curves else 0
    band = []
    for t in range(W):
        row = {"t": t}
        for name in ("A", "B"):
            sims = [c[t][f"sim_delay_{name}"] for c in curves if c[t][f"sim_delay_{name}"] is not None]
            ans = [c[t][f"analytic_delay_{name}"] for c in curves if c[t][f"analytic_delay_{name}"] is not None]
            ci = _ci(sims)
            row[f"sim_{name}"], row[f"sim_{name}_lo"], row[f"sim_{name}_hi"] = ci["mean"], ci["lo"], ci["hi"]
            row[f"analytic_{name}"] = float(np.mean(ans)) if ans else None
        band.append(row)
    agg = {}
    for idx, name in enumerate(("A", "B")):
        agg[name] = {
            "mean_delay": _ci([s[name]["mean_delay"] for s in summaries]),
            "analytic_mean_delay": _ci([s[name]["analytic_mean_delay"] for s in summaries]),
            "analytic_rho_mean_delay": _ci([s[name]["analytic_rho_mean_delay"] for s in summaries]),
            "equilibrium_delay": eq["delay"][idx],
            "delivered": _ci([s[name]["delivered"] for s in summaries]),
            "cancelled": _ci([s[name]["cancelled"] for s in summaries]),
            "mean_active_riders": _ci([s[name]["mean_active_riders"] for s in summaries]),
            "mean_rho": _ci([s[name]["mean_rho"] for s in summaries]),
            "equilibrium_riders": eq["N"][idx],
        }
    m = cfg["market"]
    step = max(1, len(rhos) // 600)
    return {
        "runs": runs, "band": band, "aggregate": agg,
        "error": {k: _ci([e[k] for e in errors]) for k in ("mae", "mape", "bias")},
        "fitted_delay_curve": _fit_delay_curve(np.array(rhos), np.array(delays), m["d0"], m["s"]),
        "scatter": [{"rho": float(r), "delay": float(d)} for r, d in list(zip(rhos, delays))[::step]],
    }


def run_simulation(cfg: dict, scenario="Peak", model: str | None = None, seed: int | None = None,
                   mc_runs: int | None = None) -> dict:
    sc = cfg["simulation"]
    model = model or sc["model"]
    seed = int(sc["seed"] if seed is None else seed)
    runs = int(sc["mc_runs"] if mc_runs is None else mc_runs)
    res, eq = _equilibrium(cfg, scenario, model)
    demand = resolve_demand(cfg, scenario)
    sim = Simulation(sc, cfg["market"], eq, demand, seed, record_frames=True)
    display = attach_analytic(cfg, eq, sim.run())
    mc = monte_carlo(cfg, scenario, model, runs, seed) if runs > 0 else None
    return {
        "scenario": scenario, "model": model, "model_label": res["label"], "seed": seed,
        "demand_rate": demand, "equilibrium": eq,
        "city": {"size_km": sim.city.size, "hotspots": sim.city.hotspots.round(2).tolist(),
                 "restaurants": sim.city.restaurants.round(2).tolist()},
        "frame_scale": 10, "frame_every_min": sc["frame_every_min"],
        "frame_format": {
            "riders": ["rider id", "x*10", "y*10", "platform (0=A, 1=B)",
                       "phase (0 idle, 1 to restaurant, 2 at restaurant, 3 to customer)"],
            "orders": ["x*10", "y*10", "platform", "state (0 waiting at restaurant, 1 en route: customer location)"],
        },
        "frames": display["frames"], "per_minute": display["per_minute"],
        "summary": display["summary"], "error": error_metrics(display["per_minute"]),
        "monte_carlo": mc,
    }


def validate_scenarios(cfg: dict, model: str | None = None, runs: int = 10) -> dict:
    """Simulated vs analytical delay for every demand scenario (Monte Carlo means with 95% CI),
    plus a delay curve d0 + s rho/(1-rho) fitted to the pooled simulated data."""
    sc = cfg["simulation"]
    model = model or sc["model"]
    rows, scatter = [], []
    for s in cfg["scenarios"]:
        mc = monte_carlo(cfg, s, model, runs, int(sc["seed"]))
        scatter += [{**pt, "scenario": s} for pt in mc["scatter"]]
        for name in ("A", "B"):
            a = mc["aggregate"][name]
            rows.append({"scenario": s, "platform": name,
                         "sim_mean": a["mean_delay"]["mean"], "sim_lo": a["mean_delay"]["lo"],
                         "sim_hi": a["mean_delay"]["hi"],
                         "analytic_realized": a["analytic_mean_delay"]["mean"],
                         "analytic_equilibrium": a["equilibrium_delay"],
                         "mae": mc["error"]["mae"]["mean"], "mape": mc["error"]["mape"]["mean"],
                         "rho": a["mean_rho"]["mean"], "riders": a["mean_active_riders"]["mean"],
                         "cancelled": a["cancelled"]["mean"], "delivered": a["delivered"]["mean"]})
    m = cfg["market"]
    fit = _fit_delay_curve(np.array([p["rho"] for p in scatter]), np.array([p["delay"] for p in scatter]),
                           m["d0"], m["s"])
    grid = np.linspace(0.05, 0.95, 37)
    curve = [{"rho": float(r), "analytic": float(m["d0"] + m["s"] * r / (1 - r)),
              "fitted": (float(fit["d0"] + fit["s"] * r / (1 - r)) if fit["d0"] is not None else None)}
             for r in grid]
    mape = float(np.mean([r["mape"] for r in rows]))
    return {"model": model, "runs": runs, "rows": rows, "scatter": scatter, "fitted_delay_curve": fit,
            "curve": curve, "overall_mape": mape,
            "notes": [
                "Simulated delay is order-weighted over the 3-hour window; the analytical value is the "
                "fixed-point delay re-solved at each minute's arrival rate (quasi-static), order-weighted.",
                "A fleet of ~250 parallel riders shows little queueing until utilisation nears 1, so the "
                "simulated delay curve is flatter at moderate load and steeper near saturation than "
                "d0 + s rho/(1-rho): the analytical function is conservative at moderate load.",
            ]}
