"""Discrete strategic-form (bimatrix) games: pure NE with best-response highlighting, iterated
elimination of dominated strategies (step by step), mixed NE by support enumeration, maxmin
strategies, and Prisoner's Dilemma detection. The market version discretises incentives into
Low / Medium / High and fills the payoff matrix from the shared market environment."""
from __future__ import annotations

import itertools

import numpy as np
from scipy.optimize import linprog

from .common import make_env

EPS = 1e-9


# ---------------------------------------------------------------- generic bimatrix tools
def best_response_masks(A: np.ndarray, B: np.ndarray) -> tuple[list, list]:
    row_br = (A >= A.max(axis=0, keepdims=True) - EPS)
    col_br = (B >= B.max(axis=1, keepdims=True) - EPS)
    return row_br.tolist(), col_br.tolist()


def pure_nash(A: np.ndarray, B: np.ndarray) -> list:
    row_br, col_br = best_response_masks(A, B)
    return [[i, j] for i in range(A.shape[0]) for j in range(A.shape[1]) if row_br[i][j] and col_br[i][j]]


def _mixed_dominator(P: np.ndarray, s: int, others: list, strict: bool):
    """Is own strategy s dominated by a mixture over `others`? P is (own x rival) payoffs.
    Maximise eps s.t. sum_t sigma_t P[t, j] >= P[s, j] + eps for all j."""
    if len(others) < 2:
        return None
    n = len(others)
    c = np.zeros(n + 1)
    c[-1] = -1.0  # maximise eps
    A_ub = np.hstack([-P[others, :].T, np.ones((P.shape[1], 1))])
    b_ub = -P[s, :]
    A_eq = np.hstack([np.ones((1, n)), np.zeros((1, 1))])
    res = linprog(c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=[1.0],
                  bounds=[(0, 1)] * n + [(None, None)], method="highs")
    if res.success and res.x[-1] > 1e-7 and strict:
        return {others[t]: float(res.x[t]) for t in range(n) if res.x[t] > 1e-9}
    return None


def iterated_elimination(A: np.ndarray, B: np.ndarray, row_labels: list, col_labels: list,
                         weak: bool = False) -> dict:
    """IESDS (weak=False) or IEWDS (weak=True), one elimination per step, recorded for animation."""
    rows, cols = list(range(A.shape[0])), list(range(A.shape[1]))
    steps = []
    turn = 0  # players alternate; after an elimination the other player moves next

    def try_eliminate(player: str) -> bool:
        own = rows if player == "Row" else cols
        P = A[np.ix_(rows, cols)] if player == "Row" else B[np.ix_(rows, cols)].T
        labels = row_labels if player == "Row" else col_labels
        for a_idx, s in enumerate(own):
            dominated_by = None
            for b_idx, t in enumerate(own):
                if t == s:
                    continue
                diff = P[b_idx] - P[a_idx]
                if weak:
                    if np.all(diff >= -EPS) and np.any(diff > EPS):
                        dominated_by = {"pure": labels[t]}
                elif np.all(diff > EPS):
                    dominated_by = {"pure": labels[t]}
                if dominated_by:
                    break
            if dominated_by is None and not weak:
                others = [k for k in range(len(own)) if k != a_idx]
                mix = _mixed_dominator(P, a_idx, others, strict=True)
                if mix:
                    dominated_by = {"mixed": {labels[own[k]]: w for k, w in mix.items()}}
            if dominated_by:
                own.remove(s)
                steps.append({
                    "player": player, "eliminated": labels[s], "index": s,
                    "dominated_by": dominated_by, "kind": "weak" if weak else "strict",
                    "remaining_rows": [row_labels[r] for r in rows],
                    "remaining_cols": [col_labels[c] for c in cols],
                })
                return True
        return False

    players = ("Row", "Column")
    while True:
        if try_eliminate(players[turn]):
            turn = 1 - turn
        elif try_eliminate(players[1 - turn]):
            pass  # same player (the other one) may continue; turn stays pointing at the first
        else:
            break
    return {"kind": "weak" if weak else "strict", "steps": steps,
            "remaining_rows": [row_labels[r] for r in rows],
            "remaining_cols": [col_labels[c] for c in cols],
            "solved": len(rows) == 1 and len(cols) == 1}


def _indifference(M: np.ndarray, own: tuple, rival: tuple):
    """Rival mixture q on `rival` making the owner indifferent across `own`. M is owner x rival."""
    k = len(own)
    sub = M[np.ix_(own, rival)]
    # [sub, -1] q,v = 0 ; sum q = 1
    lhs = np.vstack([np.hstack([sub, -np.ones((k, 1))]),
                     np.hstack([np.ones((1, len(rival))), np.zeros((1, 1))])])
    rhs = np.zeros(k + 1)
    rhs[-1] = 1.0
    try:
        sol = np.linalg.solve(lhs, rhs) if lhs.shape[0] == lhs.shape[1] else np.linalg.lstsq(lhs, rhs, rcond=None)[0]
    except np.linalg.LinAlgError:
        return None
    if not np.allclose(lhs @ sol, rhs, atol=1e-8):
        return None
    return sol[:-1], sol[-1]


def mixed_nash(A: np.ndarray, B: np.ndarray) -> list:
    """All Nash equilibria found by support enumeration (equal-size supports + pure NE)."""
    m, n = A.shape
    found = []

    def add(p, q):
        for (p2, q2) in found:
            if np.allclose(p, p2, atol=1e-6) and np.allclose(q, q2, atol=1e-6):
                return
        found.append((p, q))

    for i, j in pure_nash(A, B):
        p, q = np.zeros(m), np.zeros(n)
        p[i], q[j] = 1.0, 1.0
        add(p, q)
    for k in range(2, min(m, n) + 1):
        for I in itertools.combinations(range(m), k):
            for J in itertools.combinations(range(n), k):
                rq = _indifference(A, I, J)          # q makes row indifferent over I
                rp = _indifference(B.T, J, I)        # p makes column indifferent over J
                if rq is None or rp is None:
                    continue
                qJ, v = rq
                pI, u = rp
                if np.any(qJ < -1e-9) or np.any(pI < -1e-9):
                    continue
                p, q = np.zeros(m), np.zeros(n)
                p[list(I)], q[list(J)] = pI, qJ
                p, q = np.clip(p, 0, 1), np.clip(q, 0, 1)
                if np.any(A @ q > v + 1e-7) or np.any(p @ B > u + 1e-7):
                    continue
                add(p, q)
    return [{"row": p.tolist(), "col": q.tolist(),
             "payoff_row": float(p @ A @ q), "payoff_col": float(p @ B @ q),
             "pure": bool(np.max(p) > 1 - 1e-9 and np.max(q) > 1 - 1e-9)} for p, q in found]


def maxmin(P: np.ndarray) -> dict:
    """Security strategies for the owner of payoff matrix P (owner x rival)."""
    worst = P.min(axis=1)
    i = int(np.argmax(worst))
    m, n = P.shape
    # mixed: maximise v s.t. sum_i x_i P[i, j] >= v for all j
    c = np.zeros(m + 1)
    c[-1] = -1
    A_ub = np.hstack([-P.T, np.ones((n, 1))])
    res = linprog(c, A_ub=A_ub, b_ub=np.zeros(n), A_eq=[[1] * m + [0]], b_eq=[1],
                  bounds=[(0, 1)] * m + [(None, None)], method="highs")
    return {"pure_index": i, "pure_value": float(worst[i]),
            "mixed": res.x[:-1].tolist() if res.success else None,
            "mixed_value": float(res.x[-1]) if res.success else None}


def prisoners_dilemma(A: np.ndarray, B: np.ndarray, coop: int = 0, defect: int = 1) -> dict:
    """Classify a 2x2 cooperate/defect game: PD iff T > R > P > S for both players."""
    def payoffs(M, own_first=True):
        get = (lambda a, b: M[a, b]) if own_first else (lambda a, b: M[b, a])
        return {"T": float(get(defect, coop)), "R": float(get(coop, coop)),
                "P": float(get(defect, defect)), "S": float(get(coop, defect))}
    row, col = payoffs(A, True), payoffs(B, False)

    def is_pd(x):
        return x["T"] > x["R"] > x["P"] > x["S"]
    pd = is_pd(row) and is_pd(col)
    if pd:
        label = "Prisoner's Dilemma"
        why = ("High incentive is a dominant strategy for both platforms, yet both earn more when "
               "both choose Low: individual rationality leads to a collectively worse outcome.")
    elif row["T"] > row["R"] and row["P"] < row["S"]:
        label = "Chicken / Hawk-Dove"
        why = "Each platform prefers to match a cooperative rival but avoid mutual aggression."
    elif row["R"] >= row["T"] and row["P"] >= row["S"]:
        label = "Coordination / Stag Hunt"
        why = "Each platform's best reply is to match the rival's incentive level."
    else:
        label = "Other"
        why = "Payoff ordering does not match a canonical 2x2 game."
    return {"is_pd": pd, "label": label, "explanation": why, "row": row, "col": col,
            "repeated_pd_condition": bool(2 * row["R"] > row["T"] + row["S"])}


def analyze(A, B, row_labels: list, col_labels: list) -> dict:
    A, B = np.asarray(A, float), np.asarray(B, float)
    row_br, col_br = best_response_masks(A, B)
    out = {
        "row_labels": row_labels, "col_labels": col_labels,
        "payoff_row": A.tolist(), "payoff_col": B.tolist(),
        "best_response_row": row_br, "best_response_col": col_br,
        "pure_nash": pure_nash(A, B),
        "iesds": iterated_elimination(A, B, row_labels, col_labels, weak=False),
        "iewds": iterated_elimination(A, B, row_labels, col_labels, weak=True),
        "mixed_nash": mixed_nash(A, B),
        "maxmin": {"row": maxmin(A), "col": maxmin(B.T)},
    }
    if A.shape == (2, 2):
        out["classification"] = prisoners_dilemma(A, B)
    return out


# ---------------------------------------------------------------- market matrix game
def default_levels(cfg: dict, scenario) -> dict:
    """Low = collusive incentive w_c; High = best one-shot deviation against it, w_d = BR(w_c);
    Medium = midpoint. With these levels the Low/High game is exactly the cooperate/defect stage
    game of the repeated incentive game."""
    from .registry import solve
    from .solvers import best_response
    env = make_env(cfg, scenario)
    wc = solve("collusion", cfg, scenario, curves=False)["equilibrium"]["A"]
    wb = cfg["bounds"]["w"]
    wd, _ = best_response(lambda v: env.profits(wA=v, wB=wc)[0], wb[0], wb[1], 201)
    w_nash = solve("bertrand_incentive", cfg, scenario, curves=False)["equilibrium"]["A"]
    if wd - wc < 1.0:
        wd = wc + 5.0
    return {"levels": [round(wc, 2), round(0.5 * (wc + wd), 2), round(wd, 2)],
            "collusive": wc, "deviation": wd, "nash": w_nash}


def market_matrix(cfg: dict, scenario, levels: list | None = None) -> dict:
    env = make_env(cfg, scenario)
    labels = list(cfg["matrix_game"]["labels"])
    reference = default_levels(cfg, scenario)
    if levels is None:
        levels = reference["levels"]
    levels = [float(v) for v in levels]
    if len(labels) != len(levels):
        labels = [f"w={v:g}" for v in levels]
    n = len(levels)
    A, B = np.zeros((n, n)), np.zeros((n, n))
    cells = []
    for i, wa in enumerate(levels):
        row = []
        for j, wb in enumerate(levels):
            o = env.evaluate(wA=wa, wB=wb)
            A[i, j], B[i, j] = o["profit"]
            row.append({"delay": o["delay"], "N": o["N"], "completed": o["completed"],
                        "incentive_spend": o["incentive_spend"]})
        cells.append(row)
    full = analyze(A, B, labels, labels)
    lo, hi = 0, n - 1
    sub_idx = [lo, hi]
    A2, B2 = A[np.ix_(sub_idx, sub_idx)], B[np.ix_(sub_idx, sub_idx)]
    two = analyze(A2, B2, [labels[lo], labels[hi]], [labels[lo], labels[hi]])
    return {"scenario": scenario, "demand_rate": env.L, "levels": levels, "labels": labels,
            "reference": {k: v for k, v in reference.items() if k != "levels"},
            "cells": cells, "full": full, "low_high": two,
            "notes": [
                "Payoffs are platform profits (INR per peak hour) computed by the shared market "
                "environment with fees fixed at p; rows are Platform A's incentive, columns B's.",
                "Default levels: Low = collusive (joint-profit) incentive; High = the most profitable "
                "one-shot deviation against Low; Medium = midpoint. The continuous-game Bertrand "
                "equilibrium incentive is shown for reference.",
            ]}
