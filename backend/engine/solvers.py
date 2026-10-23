"""Generic numerical game solvers (model-agnostic, two players indexed 0=A and 1=B).

`payoff(i, x)` returns player i's payoff at the strategy profile x = [x_A, x_B].
`bounds(i, x)` returns player i's feasible interval given the rival's strategy in x
(bounds may depend on the rival, e.g. capacities must leave N_0 > 0).

Best responses are *global*: a grid search followed by a bounded Brent refinement around the
best grid point. Platform payoffs in this market are not always concave in own strategy, so a
purely local optimiser can return the wrong branch.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy.optimize import minimize, minimize_scalar

Payoff = Callable[[int, list], float]
Bounds = Callable[[int, list], tuple]


def _with(x: list, i: int, v: float) -> list:
    y = list(x)
    y[i] = float(v)
    return y


def best_response(f: Callable[[float], float], lo: float, hi: float, grid: int = 61,
                  xatol: float = 1e-7, refine: bool = True) -> tuple[float, float]:
    """Global maximiser of a scalar function on [lo, hi]."""
    if hi - lo <= 1e-12:
        return lo, f(lo)
    xs = np.linspace(lo, hi, grid)
    vals = np.array([f(x) for x in xs])
    i = int(np.argmax(vals))
    best = (float(xs[i]), float(vals[i]))
    if not refine:
        return best
    a, b = xs[max(i - 1, 0)], xs[min(i + 1, grid - 1)]
    res = minimize_scalar(lambda x: -f(x), bounds=(a, b), method="bounded",
                          options={"xatol": xatol * max(hi - lo, 1.0)})
    if -res.fun > best[1]:
        best = (float(res.x), float(-res.fun))
    return best


@dataclass
class NashResult:
    x: list
    payoffs: list
    converged: bool
    iterations: int
    damping: float
    path: list = field(default_factory=list)

    def info(self) -> dict:
        return {"converged": self.converged, "iterations": self.iterations,
                "damping": self.damping, "path": [[float(a), float(b)] for a, b in self.path]}


def nash_br_iteration(payoff: Payoff, bounds: Bounds, x0: list, grid: int = 61,
                      max_iter: int = 200, tol: float = 1e-5,
                      damping_schedule: tuple = (1.0, 0.5, 0.25), refine: bool = True) -> NashResult:
    """Gauss-Seidel best-response iteration x_i <- x_i + a (BR_i(x_-i) - x_i).

    If undamped iteration cycles, retry with stronger damping. A fixed point of the damped
    map is still a fixed point of BR, i.e. a pure-strategy Nash equilibrium."""
    last = None
    for alpha in damping_schedule:
        x = [float(v) for v in x0]
        path = [tuple(x)]
        for it in range(1, max_iter + 1):
            old = list(x)
            for i in (0, 1):
                lo, hi = bounds(i, x)
                br, _ = best_response(lambda v: payoff(i, _with(x, i, v)), lo, hi, grid, refine=refine)
                x[i] = min(max(x[i] + alpha * (br - x[i]), lo), hi)
            path.append(tuple(x))
            if max(abs(x[0] - old[0]), abs(x[1] - old[1])) < tol:
                return NashResult(x, [payoff(0, x), payoff(1, x)], True, it, alpha, path)
        last = NashResult(x, [payoff(0, x), payoff(1, x)], False, max_iter, alpha, path)
    return last


def deviation_check(payoff: Payoff, x: list, bounds: Bounds, grid: int = 401,
                    tol_rel: float = 1e-3, tol_abs: float = 1.0,
                    names: tuple = ("A", "B"), players_to_check: tuple = (0, 1)) -> dict:
    """Verify NE: no player gains from any unilateral deviation on a fine grid (+ local polish)."""
    players = []
    for i in players_to_check:
        lo, hi = bounds(i, x)
        eq = payoff(i, x)
        dev, dev_val = best_response(lambda v: payoff(i, _with(x, i, v)), lo, hi, grid)
        gain = dev_val - eq
        tol = max(tol_abs, tol_rel * abs(eq))
        players.append({
            "player": names[i], "strategy": float(x[i]), "payoff": float(eq),
            "best_deviation": float(dev), "best_deviation_payoff": float(dev_val),
            "gain": float(gain), "tolerance": float(tol), "passed": bool(gain <= tol),
        })
    return {"passed": all(p["passed"] for p in players), "grid_points": grid, "players": players}


def br_curves(payoff: Payoff, bounds: Bounds, ranges: tuple, points: int = 41,
              grid: int = 61) -> dict:
    """Best-response curves in (x_A, x_B) space for plotting.

    curve "A": points (BR_A(x_B), x_B) for x_B on ranges[1]
    curve "B": points (x_A, BR_B(x_A)) for x_A on ranges[0]"""
    out = {"A": [], "B": []}
    for xb in np.linspace(ranges[1][0], ranges[1][1], points):
        x = [0.0, float(xb)]
        lo, hi = bounds(0, x)
        if hi <= lo:
            continue
        br, _ = best_response(lambda v: payoff(0, [v, float(xb)]), lo, hi, grid)
        out["A"].append({"x": br, "y": float(xb)})
    for xa in np.linspace(ranges[0][0], ranges[0][1], points):
        x = [float(xa), 0.0]
        lo, hi = bounds(1, x)
        if hi <= lo:
            continue
        br, _ = best_response(lambda v: payoff(1, [float(xa), v]), lo, hi, grid)
        out["B"].append({"x": float(xa), "y": br})
    return out


def stackelberg(payoff: Payoff, bounds: Bounds, leader: int = 0, grid: int = 61,
                follower_grid: int = 61, leader_guess: float | None = None) -> dict:
    """Backward induction: follower best-responds to every leader commitment; the leader
    maximises its payoff anticipating that response."""
    follower = 1 - leader

    def follower_br(xl: float) -> float:
        x = _with([0.0, 0.0], leader, xl)
        lo, hi = bounds(follower, x)
        return best_response(lambda v: payoff(follower, _with(x, follower, v)), lo, hi, follower_grid)[0]

    def profile(xl: float) -> list:
        return _with(_with([0.0, 0.0], leader, xl), follower, follower_br(xl))

    def leader_value(xl: float) -> float:
        return payoff(leader, profile(xl))

    lo, hi = bounds(leader, [0.0, 0.0])
    xl, val = best_response(leader_value, lo, hi, grid)
    x = profile(xl)
    return {"x": x, "leader_payoff": val, "follower_payoff": payoff(follower, x),
            "follower_br": follower_br, "leader_value": leader_value, "bounds": (lo, hi)}


def leader_check(leader_value: Callable[[float], float], x_leader: float, lo: float, hi: float,
                 grid: int = 121, tol_rel: float = 1e-3, tol_abs: float = 1.0) -> dict:
    """Verify the leader's commitment is optimal given the follower's best-response function."""
    eq = leader_value(x_leader)
    xs = np.linspace(lo, hi, grid)
    vals = [leader_value(v) for v in xs]
    j = int(np.argmax(vals))
    gain = float(vals[j] - eq)
    tol = max(tol_abs, tol_rel * abs(eq))
    return {"passed": gain <= tol, "grid_points": grid, "leader_payoff": float(eq),
            "best_grid_commitment": float(xs[j]), "best_grid_payoff": float(vals[j]),
            "gain": gain, "tolerance": float(tol)}


def maximize(f: Callable[[np.ndarray], float], bounds: list, starts: list,
             method: str = "Powell") -> tuple[np.ndarray, float]:
    """Multi-start bounded local maximisation."""
    best_x, best_v = None, -np.inf
    for s in starts:
        res = minimize(lambda z: -f(np.asarray(z)), np.asarray(s, dtype=float), method=method,
                       bounds=bounds, options={"xtol": 1e-6, "ftol": 1e-10, "maxiter": 20000})
        if -res.fun > best_v:
            best_x, best_v = np.asarray(res.x), float(-res.fun)
    return best_x, best_v


def grid_optimality_check(f: Callable[[np.ndarray], float], x: np.ndarray, axes: list,
                          tol_rel: float = 1e-3, tol_abs: float = 1.0) -> dict:
    """Verify a joint optimum: no point on a coarse product grid beats it."""
    eq = f(np.asarray(x))
    mesh = np.meshgrid(*axes, indexing="ij")
    pts = np.stack([m.ravel() for m in mesh], axis=1)
    vals = np.array([f(p) for p in pts])
    j = int(np.argmax(vals))
    gain = float(vals[j] - eq)
    tol = max(tol_abs, tol_rel * abs(eq))
    return {"passed": gain <= tol, "grid_points": int(len(pts)), "objective": float(eq),
            "best_grid_point": [float(v) for v in pts[j]], "best_grid_value": float(vals[j]),
            "gain": gain, "tolerance": float(tol)}
