"""Repeated incentive game: grim-trigger critical discount factor, strategy tournament, and
imperfect observability (a cooperative move is mis-observed as defection with some probability).

Stage game: Cooperate = collusive incentive w_c, Defect = best one-shot deviation w_d = BR(w_c),
with payoffs from the shared market environment (INR per peak hour; one stage = one day's peak).
"""
from __future__ import annotations

import numpy as np

from .matrix_game import market_matrix, prisoners_dilemma

STRATEGIES = {
    "ALLD": "Always Defect",
    "ALLC": "Always Cooperate",
    "GRIM": "Grim Trigger",
    "TFT": "Tit-for-Tat",
    "GTFT": "Generous Tit-for-Tat",
}
C, D = 0, 1


def critical_delta(T: float, R: float, P: float) -> float | None:
    """Grim trigger sustains (C, C) iff R/(1-d) >= T + d P/(1-d)  <=>  d >= (T-R)/(T-P)."""
    if T <= R:
        return 0.0
    if T <= P:
        return None
    return (T - R) / (T - P)


def _decide(strategy: str, t: int, opp_obs_last: np.ndarray, triggered: np.ndarray,
            generosity: float, rng: np.random.Generator) -> np.ndarray:
    n = opp_obs_last.shape[0]
    if strategy == "ALLD":
        return np.ones(n, dtype=int)
    if strategy == "ALLC":
        return np.zeros(n, dtype=int)
    if t == 0:
        return np.zeros(n, dtype=int)
    if strategy == "GRIM":
        return triggered.astype(int)
    if strategy == "TFT":
        return opp_obs_last.copy()
    if strategy == "GTFT":
        forgive = rng.random(n) < generosity
        return np.where((opp_obs_last == D) & ~forgive, D, C)
    raise KeyError(strategy)


def play_match(s1: str, s2: str, A: np.ndarray, B: np.ndarray, T: int, delta: float, noise: float,
               generosity: float, reps: int, rng: np.random.Generator) -> dict:
    """Simulate `reps` independent T-day matches (vectorised across replications)."""
    reps = reps if (noise > 0 or "GTFT" in (s1, s2)) else 1
    obs1 = np.zeros(reps, dtype=int)   # what player 1 observed player 2 do last period
    obs2 = np.zeros(reps, dtype=int)
    trig1 = np.zeros(reps, dtype=bool)
    trig2 = np.zeros(reps, dtype=bool)
    pay1 = np.zeros((reps, T))
    pay2 = np.zeros((reps, T))
    coop = np.zeros((reps, T))
    for t in range(T):
        a1 = _decide(s1, t, obs1, trig1, generosity, rng)
        a2 = _decide(s2, t, obs2, trig2, generosity, rng)
        pay1[:, t] = A[a1, a2]
        pay2[:, t] = B[a1, a2]
        coop[:, t] = ((a1 == C) & (a2 == C))
        # imperfect observability: a cooperative move is seen as defection with prob `noise`
        obs1 = np.where((a2 == C) & (rng.random(reps) < noise), D, a2)
        obs2 = np.where((a1 == C) & (rng.random(reps) < noise), D, a1)
        trig1 |= obs1 == D
        trig2 |= obs2 == D
    disc = delta ** np.arange(T)
    norm = (1 - delta) / (1 - delta ** T) if delta < 1 else 1.0 / T
    return {
        "avg_discounted": [float(norm * (pay1 @ disc).mean()), float(norm * (pay2 @ disc).mean())],
        "cumulative": [np.cumsum(pay1 * disc, axis=1).mean(axis=0).tolist(),
                       np.cumsum(pay2 * disc, axis=1).mean(axis=0).tolist()],
        "cooperation_rate": float(coop.mean()),
        "cooperation_path": coop.mean(axis=0).tolist(),
    }


def tournament(A: np.ndarray, B: np.ndarray, T: int, delta: float, noise: float, generosity: float,
               reps: int, seed: int, strategies: list | None = None) -> dict:
    rng = np.random.default_rng(seed)
    names = strategies or list(STRATEGIES)
    n = len(names)
    matrix = np.zeros((n, n))
    coop = np.zeros((n, n))
    matches = []
    for i in range(n):
        for j in range(i, n):
            res = play_match(names[i], names[j], A, B, T, delta, noise, generosity, reps, rng)
            matrix[i, j], matrix[j, i] = res["avg_discounted"][0], res["avg_discounted"][1]
            coop[i, j] = coop[j, i] = res["cooperation_rate"]
            matches.append({"row": names[i], "col": names[j], **res})
    totals = matrix.mean(axis=1)
    ranking = [{"strategy": names[k], "name": STRATEGIES[names[k]], "score": float(totals[k])}
               for k in np.argsort(-totals)]
    return {"strategies": names, "names": [STRATEGIES[s] for s in names],
            "payoff_matrix": matrix.tolist(), "cooperation_matrix": coop.tolist(),
            "ranking": ranking, "matches": matches}


def solve_repeated(cfg: dict, scenario, delta: float | None = None, noise: float | None = None,
                   T: int | None = None, generosity: float | None = None) -> dict:
    from .registry import solve
    rc = cfg["repeated"]
    delta = rc["delta"] if delta is None else float(delta)
    noise = rc["noise"] if noise is None else float(noise)
    T = int(rc["T"] if T is None else T)
    generosity = rc["generosity"] if generosity is None else float(generosity)

    mm = market_matrix(cfg, scenario)
    lo, hi = 0, len(mm["levels"]) - 1
    A = np.array(mm["full"]["payoff_row"])[np.ix_([lo, hi], [lo, hi])]
    B = np.array(mm["full"]["payoff_col"])[np.ix_([lo, hi], [lo, hi])]
    cls = prisoners_dilemma(A, B)
    Tp, Rp, Pp, Sp = (cls["row"][k] for k in ("T", "R", "P", "S"))
    d_star = critical_delta(Tp, Rp, Pp)

    # spec formula with Nash reversion in the continuous incentive game
    pi_nash = solve("bertrand_incentive", cfg, scenario, curves=False)["outcome"]["profit"][0]
    d_star_nash = critical_delta(Tp, Rp, pi_nash)

    deltas = np.linspace(0.0, 0.99, 100)
    value_curve = [{"delta": float(d), "cooperate": Rp, "deviate": float((1 - d) * Tp + d * Pp),
                    "deviate_nash_reversion": float((1 - d) * Tp + d * pi_nash)} for d in deltas]

    tour = tournament(A, B, T, delta, noise, generosity, rc["replications"], rc["seed"])
    noise_levels = [0.0, 0.01, 0.02, 0.05, 0.1, 0.2]
    noise_sweep = []
    rng = np.random.default_rng(rc["seed"])
    for eps in noise_levels:
        row = {"noise": eps}
        for s in ("GRIM", "TFT", "GTFT"):
            res = play_match(s, s, A, B, T, delta, eps, generosity, rc["replications"], rng)
            row[s] = res["cooperation_rate"]
            row[f"{s}_payoff"] = res["avg_discounted"][0]
        noise_sweep.append(row)

    sustainable = d_star is not None and delta >= d_star
    return {
        "scenario": scenario, "delta": delta, "noise": noise, "T": T, "generosity": generosity,
        "levels": {"cooperate": mm["levels"][lo], "defect": mm["levels"][hi],
                   "nash": mm["reference"]["nash"]},
        "stage_game": {"labels": ["Cooperate (Low)", "Defect (High)"], "payoff_row": A.tolist(),
                       "payoff_col": B.tolist(), "T": Tp, "R": Rp, "P": Pp, "S": Sp,
                       "classification": cls},
        "pi_nash_continuous": pi_nash,
        "delta_star": d_star, "delta_star_nash_reversion": d_star_nash,
        "cooperation_sustainable": sustainable,
        "value_curve": value_curve, "tournament": tour, "noise_sweep": noise_sweep,
        "notes": [
            f"Grim trigger: cooperate until a defection is observed, then defect forever. "
            f"Cooperation is an SPE iff delta >= delta* = (T - R)/(T - P) = "
            f"{d_star if d_star is None else round(d_star, 3)}.",
            "With Nash reversion in the continuous incentive game (punishment = one-shot Bertrand "
            f"equilibrium profit), delta* = {d_star_nash if d_star_nash is None else round(d_star_nash, 3)}. "
            "The harsher punishment makes cooperation easier to sustain.",
            "With imperfect observability a single mis-observed move triggers grim punishment forever; "
            "forgiving strategies (Generous TFT) recover cooperation.",
        ],
    }
