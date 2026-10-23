"""Auto-generated key findings from the cross-model comparison, the leader-follower models and the
repeated game. Every number quoted is computed, not hard-coded."""
from __future__ import annotations

from .config import config_key
from .registry import _get, _put, compare, solve


def _fmt(x: float, digits: int = 0) -> str:
    return f"{x:,.{digits}f}"


def generate(cfg: dict) -> dict:
    key = ("insights", config_key(cfg))
    hit = _get(key)
    if hit is not None:
        return hit
    from .repeated import solve_repeated

    comp = compare(cfg)
    rows = {(r["model"], r["scenario"]): r for r in comp["rows"]}
    scen = comp["scenarios"]
    out = []

    # 1. Does incentive competition buy lower delay, or transfer surplus to riders?
    per = []
    for s in scen:
        b, c, col = rows[("bertrand_incentive", s)], rows[("cournot", s)], rows[("collusion", s)]
        d_spend = b["total_incentive_spend"] - col["total_incentive_spend"]
        d_delay = col["avg_delay"] - b["avg_delay"]
        d_rs = b["rider_surplus"] - col["rider_surplus"]
        per.append({"scenario": s, "extra_spend": d_spend, "delay_saved": d_delay,
                    "rider_share": d_rs / d_spend if d_spend > 0 else None,
                    "inr_per_minute": d_spend / d_delay if d_delay > 0 else None,
                    "spend_vs_cournot": b["total_incentive_spend"] / c["total_incentive_spend"] - 1})
    peak = next(p for p in per if p["scenario"] == scen[-1])
    out.append({
        "id": "incentive_war", "title": "Incentive wars mostly transfer surplus to riders",
        "text": (f"Moving from the incentive cartel to one-shot incentive (Bertrand) competition raises "
                 f"incentive spend by INR {_fmt(peak['extra_spend'])}/h in the {scen[-1]} scenario but cuts "
                 f"average delay by only {peak['delay_saved']:.1f} min "
                 f"(about INR {_fmt(peak['inr_per_minute'] or 0)} per minute saved). Roughly "
                 f"{(peak['rider_share'] or 0) * 100:.0f}% of the extra spend reappears as rider surplus: the "
                 "war is mainly a transfer from platforms to riders, because once the shared pool is "
                 "exhausted extra incentives only move riders between platforms."),
        "data": per,
    })

    # 2. Efficiency ranking
    eff = []
    for s in scen:
        ranked = sorted([(rows[(m, s)]["efficiency"], m, rows[(m, s)]["label"])
                         for m in comp["efficiency_heatmap"]["models"] if m != "planner"], reverse=True)
        eff.append({"scenario": s, "best": ranked[0][2], "best_eff": ranked[0][0],
                    "worst": ranked[-1][2], "worst_eff": ranked[-1][0]})
    text = " ".join(f"{e['scenario']}: best {e['best']} ({e['best_eff'] * 100:.1f}% of first-best), "
                    f"worst {e['worst']} ({e['worst_eff'] * 100:.1f}%)." for e in eff)
    if any(e["best"] == rows[("bertrand_incentive", scen[0])]["label"] for e in eff):
        text += (" Incentive competition scores well on efficiency even though it hurts platforms: incentives "
                 "are transfers, and the war pulls the whole rider pool online, which is what the planner "
                 "wants too. Platform losses reappear as rider surplus. The cartel is worst because it "
                 "withholds riders to save on incentives.")
    out.append({
        "id": "efficiency", "title": "Which market structure comes closest to the planner?",
        "text": text, "data": eff,
    })

    # 3. Moving first
    fma = []
    for s in scen:
        cap = solve("stackelberg_capacity", cfg, s, curves=False)
        inc = solve("stackelberg_incentive", cfg, s, curves=False)
        fma.append({"scenario": s, "capacity_fma": cap["extras"]["first_mover_advantage"],
                    "capacity_follower_change": cap["extras"]["follower_change"],
                    "incentive_fma": inc["extras"]["first_mover_advantage"],
                    "incentive_follower_change": inc["extras"]["follower_change"],
                    "incentive_leader_profit": inc["outcome"]["profit"][0],
                    "incentive_follower_profit": inc["outcome"]["profit"][1]})
    last = fma[-1]
    second_mover = last["incentive_follower_profit"] > last["incentive_leader_profit"]
    out.append({
        "id": "first_mover", "title": "When does moving first help?",
        "text": (f"Committing to capacity first always helps the leader: the first-mover advantage grows from "
                 f"INR {_fmt(fma[0]['capacity_fma'])}/h ({scen[0]}) to INR {_fmt(last['capacity_fma'])}/h "
                 f"({scen[-1]}) because capacities are strategic substitutes. Committing to an incentive "
                 f"also raises the leader's profit (INR {_fmt(last['incentive_fma'])}/h in {scen[-1]}) by "
                 "softening the war, but incentives are strategic complements, so "
                 + ("the follower gains even more: a second-mover advantage." if second_mover
                    else "the follower gains as well.")),
        "data": fma,
    })

    # 4. Sustaining cooperation
    rep = []
    for s in scen:
        r = solve_repeated(cfg, s)
        rep.append({"scenario": s, "delta_star": r["delta_star"],
                    "delta_star_nash": r["delta_star_nash_reversion"],
                    "is_pd": r["stage_game"]["classification"]["is_pd"]})
    out.append({
        "id": "cooperation", "title": "How patient must platforms be to avoid an incentive war?",
        "text": (f"With grim-trigger strategies the cooperative (low-incentive) outcome is sustainable when the "
                 f"daily discount factor is at least {rep[0]['delta_star']:.2f} in the {scen[0]} scenario, rising "
                 f"to {rep[-1]['delta_star']:.2f} in the {scen[-1]} scenario. Peaks raise the one-shot temptation "
                 "to poach riders, so tacit collusion is hardest exactly when demand is highest. Reverting to "
                 f"the full one-shot equilibrium as punishment lowers the threshold to {rep[-1]['delta_star_nash']:.2f}."),
        "data": rep,
    })

    # 5. Capacity-then-price (Kreps-Scheinkman)
    ks = []
    for s in scen:
        ts, c = rows[("two_stage", s)], rows[("cournot", s)]
        ks.append({"scenario": s, "two_stage_N": ts["N_A"], "cournot_N": c["N_A"],
                   "two_stage_fee": ts["p_A"], "two_stage_eff": ts["efficiency"], "cournot_eff": c["efficiency"]})
    gap = max(abs(k["two_stage_N"] - k["cournot_N"]) / k["cournot_N"] for k in ks)
    best_at = [e["scenario"] for e in eff if e["best"] == rows[("two_stage", e["scenario"])]["label"]]
    tail = (f", which makes this the most efficient competitive structure at {' and '.join(best_at)} demand."
            if best_at else ", although another structure is more efficient in every scenario.")
    out.append({
        "id": "kreps_scheinkman", "title": "Capacity then fees reproduces Cournot capacities",
        "text": (f"When platforms commit to rider capacity before setting fees, equilibrium capacities differ from "
                 f"the Cournot capacities by at most {gap * 100:.1f}% across scenarios, the Kreps-Scheinkman "
                 "intuition. Fees then rise with demand "
                 f"(INR {ks[0]['two_stage_fee']:.0f} to {ks[-1]['two_stage_fee']:.0f}) and act as congestion "
                 "prices" + tail),
        "data": ks,
    })

    # 6. Demand level
    dl = [{"scenario": s, "bertrand_delay": rows[("bertrand_incentive", s)]["avg_delay"],
           "planner_delay": rows[("planner", s)]["avg_delay"],
           "bertrand_eff": rows[("bertrand_incentive", s)]["efficiency"]} for s in scen]
    out.append({
        "id": "peak", "title": "Peaks widen the gap to the first-best",
        "text": (f"Under incentive competition average delay rises from {dl[0]['bertrand_delay']:.1f} min "
                 f"({scen[0]}) to {dl[-1]['bertrand_delay']:.1f} min ({scen[-1]}). The planner holds it at "
                 f"{dl[-1]['planner_delay']:.1f} min by raising fees at peak (congestion pricing) rather than "
                 "paying more incentives, since the rider pool is already fully engaged."),
        "data": dl,
    })
    payload = {"insights": out, "scenarios": scen}
    return _put(key, payload)
