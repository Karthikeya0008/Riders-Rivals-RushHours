"""Regenerate every key figure of the report as PNG files in reports/figures/.

Run from the project root:
    backend\\.venv\\Scripts\\python.exe reports\\make_figures.py
All numbers come from the engine with the default configuration (backend/config/defaults.json).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from engine.bayesian import solve_bayesian  # noqa: E402
from engine.config import build_config  # noqa: E402
from engine.matrix_game import market_matrix  # noqa: E402
from engine.registry import COMPARISON_MODELS, MODEL_INFO, compare, solve  # noqa: E402
from engine.repeated import solve_repeated  # noqa: E402
from engine.sensitivity import sweep  # noqa: E402
from simulation.runner import validate_scenarios  # noqa: E402

OUT = ROOT / "reports" / "figures"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
SLOT = {m: i for i, m in enumerate(COMPARISON_MODELS)}
A, B = SERIES[0], SERIES[1]
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": "#cfcec9", "axes.labelcolor": INK2,
    "axes.titleweight": "bold", "axes.titlesize": 11.5, "axes.titlecolor": INK, "xtick.color": INK2,
    "ytick.color": INK2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
    "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "figure.dpi": 150,
    "savefig.bbox": "tight", "figure.facecolor": "white",
})


def save(fig, name: str, takeaway: str | None = None):
    if takeaway:
        fig.text(0.01, -0.02, takeaway, fontsize=9, color=INK2, ha="left", va="top", wrap=True)
    path = OUT / f"{name}.png"
    fig.savefig(path)
    plt.close(fig)
    print("wrote", path.relative_to(ROOT))


def comparison_figures(cfg):
    comp = compare(cfg, parallel=True)
    scen = comp["scenarios"]
    rows = {(r["model"], r["scenario"]): r for r in comp["rows"]}
    metrics = [("avg_delay", "Average delay (min)"), ("total_completed", "Orders completed per hour"),
               ("total_profit", "Total platform profit (INR/h)"), ("total_incentive_spend", "Incentive spend (INR/h)"),
               ("efficiency", "Efficiency W / W*")]
    width = 0.8 / len(COMPARISON_MODELS)
    for key, label in metrics:
        fig, ax = plt.subplots(figsize=(10, 4.2))
        x = np.arange(len(scen))
        for k, m in enumerate(COMPARISON_MODELS):
            vals = [rows[(m, s)][key] for s in scen]
            ax.bar(x + (k - len(COMPARISON_MODELS) / 2 + 0.5) * width, vals, width * 0.92,
                   color=SERIES[SLOT[m]], label=MODEL_INFO[m]["label"])
        ax.set_xticks(x, [f"{s}\n({comp['demand'][s]} orders/h)" for s in scen])
        ax.set_ylabel(label)
        ax.set_title(f"{label.split(' (')[0]} by model and demand scenario")
        if key == "efficiency":
            ax.set_ylim(0.6, 1.02)
        if key == "avg_delay":
            ax.set_ylim(25, None)
        ax.legend(ncol=4, fontsize=8, loc="upper center", bbox_to_anchor=(0.5, -0.18))
        save(fig, f"compare_{key}")

    # efficiency heatmap
    h = comp["efficiency_heatmap"]
    vals = np.array(h["values"])
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    im = ax.imshow(vals, cmap="Blues", vmin=vals.min() - 0.05, vmax=1.0, aspect="auto")
    ax.set_xticks(range(len(scen)), scen)
    ax.set_yticks(range(len(h["models"])), [MODEL_INFO[m]["label"] for m in h["models"]])
    ax.grid(False)
    for i in range(vals.shape[0]):
        for j in range(vals.shape[1]):
            ax.text(j, i, f"{vals[i, j] * 100:.1f}%", ha="center", va="center", fontsize=9,
                    color="white" if vals[i, j] > (vals.min() + 1) / 2 else INK)
    fig.colorbar(im, ax=ax, label="Efficiency (W / W*)")
    ax.set_title("Efficiency by model and demand scenario")
    save(fig, "efficiency_heatmap")
    return comp


def br_figure(cfg, model, scenario, fname):
    res = solve(model, cfg, scenario, curves=True)
    cA, cB = res["br_curves"]["A"], res["br_curves"]["B"]
    fig, ax = plt.subplots(figsize=(5.6, 5))
    ax.plot([p["x"] for p in cA], [p["y"] for p in cA], color=A, lw=2, label="BR of A to B's choice")
    ax.plot([p["x"] for p in cB], [p["y"] for p in cB], color=B, lw=2, label="BR of B to A's choice")
    path = np.array(res["convergence"].get("path", []))
    if len(path) > 1:
        ax.plot(path[:, 0], path[:, 1], "--o", color="#8a8984", lw=1, ms=2.5, label="BR iteration")
    eq = res["equilibrium"]
    ax.scatter([eq["A"]], [eq["B"]], s=70, color=INK, zorder=5, edgecolor="white", linewidth=1.5)
    ax.annotate(f"NE ({eq['A']:.1f}, {eq['B']:.1f})", (eq["A"], eq["B"]), xytext=(8, -14), textcoords="offset points", color=INK)
    sv = res["strategy_variable"]
    ax.set_xlabel(f"Platform A: {sv['name']} ({sv['unit']})")
    ax.set_ylabel(f"Platform B ({sv['unit']})")
    ax.set_title(f"Best-response curves: {res['label']}, {scenario} demand")
    ax.legend(fontsize=8)
    save(fig, fname)


def stackelberg_figure(cfg, scenario):
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    for ax, model in zip(axes, ("stackelberg_capacity", "stackelberg_incentive")):
        res = solve(model, cfg, scenario, curves=False)
        curve = res["extras"]["leader_curve"]
        ax.plot([p["leader"] for p in curve], [p["leader_payoff"] for p in curve], color=A, lw=2, label="A's profit given B's reaction")
        ax.axhline(res["extras"]["simultaneous_profit"][0], color="#8a8984", ls="--", lw=1.2, label="A's simultaneous-move profit")
        ax.axvline(res["equilibrium"]["A"], color=INK, ls=":", lw=1)
        ax.set_title(f"{res['label']} (FMA = INR {res['extras']['first_mover_advantage']:,.0f}/h)")
        ax.set_xlabel(f"Leader's commitment ({res['strategy_variable']['unit']})")
        ax.set_ylabel("INR per hour")
        ax.legend(fontsize=8)
    save(fig, "stackelberg_leader_curves")


def matrix_figure(cfg, scenario):
    mm = market_matrix(cfg, scenario)
    a = mm["full"]
    A_ = np.array(a["payoff_row"])
    B_ = np.array(a["payoff_col"])
    n = len(a["row_labels"])
    fig, ax = plt.subplots(figsize=(6.2, 4.2))
    ax.set_xlim(0, n)
    ax.set_ylim(0, n)
    ax.invert_yaxis()
    ax.grid(False)
    for i in range(n):
        for j in range(n):
            ne = [i, j] in a["pure_nash"]
            ax.add_patch(plt.Rectangle((j + 0.04, i + 0.04), 0.92, 0.92, fc="#f4f4f1", ec=INK if ne else "#cfcec9", lw=2 if ne else 1))
            ra = a["best_response_row"][i][j]
            cb = a["best_response_col"][i][j]
            ax.text(j + 0.5, i + 0.5, f"{A_[i, j] / 1000:.2f}k", ha="right", va="center", fontsize=10,
                    color=INK, fontweight="bold" if ra else "normal")
            ax.text(j + 0.53, i + 0.5, f", {B_[i, j] / 1000:.2f}k", ha="left", va="center", fontsize=10,
                    color=INK, fontweight="bold" if cb else "normal")
    ax.set_xticks(np.arange(n) + 0.5, [f"B: {l}" for l in a["col_labels"]])
    ax.set_yticks(np.arange(n) + 0.5, [f"A: {l}" for l in a["row_labels"]])
    lv = mm["levels"]
    ax.set_title(f"Incentive game, {scenario} (w = {lv[0]:.1f} / {lv[1]:.1f} / {lv[2]:.1f}); bold = best response, box = NE")
    save(fig, "matrix_game", f"2×2 Low/High classification: {mm['low_high']['classification']['label']}. "
                             f"IESDS removes {len(a['iesds']['steps'])} strategies and leaves (High, High).")


def repeated_figures(cfg):
    rep = {s: solve_repeated(cfg, s) for s in cfg["scenarios"]}
    r = rep["Medium"]
    vc = r["value_curve"]
    fig, ax = plt.subplots(figsize=(6.5, 4))
    d = [p["delta"] for p in vc]
    ax.plot(d, [p["cooperate"] for p in vc], color=SERIES[2], lw=2, label="Cooperate forever (R)")
    ax.plot(d, [p["deviate"] for p in vc], color=SERIES[3], lw=2, label="Deviate, grim punishment")
    ax.plot(d, [p["deviate_nash_reversion"] for p in vc], color=SERIES[3], lw=2, ls="--", label="Deviate, Nash reversion")
    ax.axvline(r["delta_star"], color="#d03b3b", lw=1.5, label=f"δ* = {r['delta_star']:.3f}")
    ax.set_xlabel("Discount factor δ")
    ax.set_ylabel("Average profit per day (INR/h)")
    ax.set_title("Grim trigger: cooperation pays when δ ≥ δ* (Medium demand)")
    ax.legend(fontsize=8)
    save(fig, "repeated_delta_star")

    fig, ax = plt.subplots(figsize=(6.5, 4))
    ns = r["noise_sweep"]
    for s, slot in (("GRIM", 4), ("TFT", 5), ("GTFT", 6)):
        ax.plot([p["noise"] for p in ns], [p[s] for p in ns], "-o", color=SERIES[slot], lw=2, ms=4, label=s)
    ax.set_xlabel("Probability a cooperative move is observed as defection")
    ax.set_ylabel("Share of days both cooperate")
    ax.set_title("Imperfect observability breaks grim trigger first")
    ax.legend(fontsize=8)
    save(fig, "repeated_noise")

    fig, ax = plt.subplots(figsize=(6.5, 3.6))
    scen = list(rep)
    ax.plot(scen, [rep[s]["delta_star"] for s in scen], "-o", color=SERIES[6], lw=2, label="δ* (2×2 punishment)")
    ax.plot(scen, [rep[s]["delta_star_nash_reversion"] for s in scen], "-o", color=SERIES[2], lw=2, label="δ* (Nash reversion)")
    ax.set_ylim(0, 1)
    ax.set_ylabel("Critical discount factor")
    ax.set_title("Cooperation is hardest to sustain at peak demand")
    ax.legend(fontsize=8)
    save(fig, "repeated_delta_by_scenario")

    tour = r["tournament"]["ranking"]
    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    ax.barh([t["name"] for t in tour][::-1], [t["score"] for t in tour][::-1],
            color=[SERIES[{"ALLC": 2, "ALLD": 3, "GRIM": 4, "TFT": 5, "GTFT": 6}[t["strategy"]]] for t in tour][::-1])
    ax.set_xlim(min(t["score"] for t in tour) * 0.95, None)
    ax.set_xlabel("Average discounted profit per day (INR/h)")
    ax.set_title(f"Round-robin tournament (δ = {r['delta']}, no noise)")
    save(fig, "repeated_tournament")
    return rep


def bayes_figure(cfg):
    res = solve_bayesian(cfg, "Peak")
    prof = res["profiles"]
    labels = [f"A={p['types'][0]}, B={p['types'][1]}" for p in prof]
    x = np.arange(len(prof))
    w = 0.2
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    ax.bar(x - 1.5 * w, [p["N"][0] for p in prof], w, color=A, label="A, Bayesian NE")
    ax.bar(x - 0.5 * w, [p["complete_info_N"][0] for p in prof], w, color=SERIES[2], label="A, complete info")
    ax.bar(x + 0.5 * w, [p["N"][1] for p in prof], w, color=B, label="B, Bayesian NE")
    ax.bar(x + 1.5 * w, [p["complete_info_N"][1] for p in prof], w, color=SERIES[3], label="B, complete info")
    ax.set_xticks(x, labels)
    ax.set_ylim(min(min(p["N"] + p["complete_info_N"]) for p in prof) * 0.9, None)
    ax.set_ylabel("Riders hired")
    ax.set_title("Bayesian Cournot (Peak, P(High) = 0.5): type-contingent capacity")
    ax.legend(fontsize=8, ncol=2)
    save(fig, "bayesian_capacity")
    return res


def simulation_figures(cfg):
    v = validate_scenarios(cfg, runs=10)
    rows = [r for r in v["rows"] if r["platform"] == "A"]
    fig, ax = plt.subplots(figsize=(6.5, 4))
    x = np.arange(len(rows))
    sim = np.array([r["sim_mean"] for r in rows])
    err = np.array([[r["sim_mean"] - r["sim_lo"] for r in rows], [r["sim_hi"] - r["sim_mean"] for r in rows]])
    ax.bar(x, sim, 0.5, color=A, yerr=err, capsize=4, label=f"Simulated (mean of {v['runs']} seeds, 95% CI)")
    ax.plot(x, [r["analytic_realized"] for r in rows], "o-", color=INK2, lw=2, label="Analytical fixed point")
    ax.set_xticks(x, [r["scenario"] for r in rows])
    ax.set_ylim(20, None)
    ax.set_ylabel("Mean delay (min)")
    ax.set_title(f"Simulation vs analytical delay (Platform A), MAPE {v['overall_mape'] * 100:.0f}%")
    ax.legend(fontsize=8)
    save(fig, "simulation_validation")

    fig, ax = plt.subplots(figsize=(6.5, 4))
    pts = v["scatter"]
    ax.scatter([p["rho"] for p in pts], [p["delay"] for p in pts], s=6, alpha=0.3, color=SERIES[2], label="Simulated minutes")
    cur = v["curve"]
    ax.plot([p["rho"] for p in cur], [p["analytic"] for p in cur], color=INK2, lw=2, label="Model d0 + s·ρ/(1−ρ)")
    f = v["fitted_delay_curve"]
    if f["d0"] is not None:
        ax.plot([p["rho"] for p in cur], [p["fitted"] for p in cur], "--", color=SERIES[6], lw=2,
                label=f"Fitted: d0 = {f['d0']:.1f}, s = {f['s']:.2f}")
    ax.set_ylim(20, 80)
    ax.set_xlabel("Utilisation ρ = λ / (k·N)")
    ax.set_ylabel("Delay (min)")
    ax.set_title("Delay vs utilisation: simulation against the delay function")
    ax.legend(fontsize=8)
    save(fig, "simulation_delay_curve")
    return v


def sensitivity_figure(cfg):
    s = sweep(cfg, "beta", scenario="Peak", models=["cournot", "bertrand_incentive", "collusion", "planner"], parallel=True)
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.8))
    for ax, (key, label) in zip(axes, (("avg_delay", "Average delay (min)"), ("efficiency", "Efficiency W / W*"))):
        for m in s["models"]:
            ax.plot([r["value"] for r in s["rows"]], [r[f"{m}__{key}"] for r in s["rows"]], "-o", ms=3, lw=2,
                    color=SERIES[SLOT[m]], label=MODEL_INFO[m]["label"])
        ax.axvline(cfg["market"]["beta"], color=INK, ls=":", lw=1)
        ax.set_xlabel("Rider incentive sensitivity β")
        ax.set_ylabel(label)
        ax.set_title(f"{label.split(' (')[0]} vs β (Peak demand)")
    axes[0].legend(fontsize=8)
    save(fig, "sensitivity_beta")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = build_config()
    comparison_figures(cfg)
    br_figure(cfg, "cournot", "Peak", "br_cournot")
    br_figure(cfg, "bertrand_incentive", "Peak", "br_bertrand_incentive")
    br_figure(cfg, "bertrand_homogeneous", "Peak", "br_bertrand_homogeneous")
    stackelberg_figure(cfg, "Peak")
    matrix_figure(cfg, "Medium")
    repeated_figures(cfg)
    bayes_figure(cfg)
    simulation_figures(cfg)
    sensitivity_figure(cfg)


if __name__ == "__main__":
    main()
