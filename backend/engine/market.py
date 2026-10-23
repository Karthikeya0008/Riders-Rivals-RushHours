"""Shared market environment used by every game model.

One peak hour in one city zone, currency INR. The only thing that differs between game
models is which variable each platform controls and the timing of moves; every model
evaluates outcomes through `MarketEnvironment.evaluate` / `MarketEnvironment.profits`.

Primitives (see docs/MODEL.md):
  riders      N_i = R e^{b w_i} / (e^{b w0} + sum_j e^{b w_j})          (logit, outside option)
  inverse     w_i = w0 + (1/b) ln(N_i / N_0),  N_0 = R - N_A - N_B
  capacity    mu_i = k N_i
  delay       rho_i = min(lam_i / mu_i, rho_max),  D_i = d0 + s rho_i / (1 - rho_i)
  demand      lam_i = Lambda e^{u_i} / (1 + sum_j e^{u_j}),  u_i = a_i - b p_i - c D_i
  profit      pi_i = completed_i (p_i + m - w_i) - F_i
Demand depends on delay and delay on demand, so (lam, D) is solved as a fixed point.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .config import MarketParams

INF = float("inf")


@dataclass
class FixedPoint:
    lam: tuple[float, float]
    D: tuple[float, float]
    rho: tuple[float, float]
    rho_raw: tuple[float, float]
    logsum: float
    iterations: int
    residual: float
    converged: bool
    method: str

    def to_dict(self) -> dict:
        return {
            "iterations": self.iterations,
            "residual": self.residual,
            "converged": self.converged,
            "method": self.method,
        }


class MarketEnvironment:
    def __init__(self, params: MarketParams, demand: float, tol: float = 1e-9, max_iter: int = 200):
        self.P = params
        self.L = float(demand)
        self.tol = tol
        self.max_iter = max_iter
        p = params
        self.D_max = p.d0 + p.s * p.rho_max / (1.0 - p.rho_max)

    # ------------------------------------------------------------------ riders
    def rider_supply(self, wA: float, wB: float) -> tuple[float, float, float]:
        """Logit split of the R multi-homing riders between A, B and the outside option."""
        P = self.P
        z0, zA, zB = P.beta * P.w0, P.beta * wA, P.beta * wB
        mx = max(z0, zA, zB)
        e0, eA, eB = math.exp(z0 - mx), math.exp(zA - mx), math.exp(zB - mx)
        tot = e0 + eA + eB
        return P.R * eA / tot, P.R * eB / tot, P.R * e0 / tot

    def incentive_for_capacity(self, NA: float, NB: float) -> tuple[float, float]:
        """Inverse rider supply: the incentive needed to attract N_i riders given the rival's N_j."""
        P = self.P
        N0 = P.R - NA - NB
        if N0 <= 0 or NA <= 0 or NB <= 0:
            raise ValueError(f"infeasible capacities N_A={NA}, N_B={NB} (R={P.R})")
        return P.w0 + math.log(NA / N0) / P.beta, P.w0 + math.log(NB / N0) / P.beta

    def rider_logsum(self, wA: float, wB: float) -> float:
        """ln(1 + sum_j e^{beta (w_j - w0)}), computed stably."""
        P = self.P
        zA, zB = P.beta * (wA - P.w0), P.beta * (wB - P.w0)
        mx = max(0.0, zA, zB)
        return mx + math.log(math.exp(-mx) + math.exp(zA - mx) + math.exp(zB - mx))

    # ------------------------------------------------------------------ delay
    def delay_from_rho(self, rho: float) -> float:
        r = min(rho, self.P.rho_max)
        return self.P.d0 + self.P.s * r / (1.0 - r)

    def _g(self, r: float) -> tuple[float, float]:
        """Delay and its derivative w.r.t. utilisation, with the rho_max cap."""
        P = self.P
        if r >= P.rho_max:
            return self.D_max, 0.0
        return P.d0 + P.s * r / (1.0 - r), P.s / (1.0 - r) ** 2

    # ------------------------------------------------------------------ demand-delay fixed point
    def _state(self, DA, DB, muA, muB, u0A, u0B):
        c, L = self.P.c, self.L
        eA, eB = math.exp(u0A - c * DA), math.exp(u0B - c * DB)
        S = 1.0 + eA + eB
        sA, sB = eA / S, eB / S
        rA, rB = L * sA / muA, L * sB / muB
        gA, gpA = self._g(rA)
        gB, gpB = self._g(rB)
        return DA - gA, DB - gB, sA, sB, rA, rB, gpA, gpB, S

    def solve_fixed_point(self, muA: float, muB: float, pA: float, pB: float,
                          method: str = "newton") -> FixedPoint:
        P = self.P
        muA, muB = max(muA, 1e-9), max(muB, 1e-9)
        u0A, u0B = P.a_A - P.b * pA, P.a_B - P.b * pB
        if method == "damped":
            DA, DB, it, res, ok = self._damped(muA, muB, u0A, u0B)
        else:
            DA, DB, it, res, ok = self._newton(muA, muB, u0A, u0B)
            if not ok:
                DA, DB, it2, res, ok = self._gauss_seidel(muA, muB, u0A, u0B)
                it += it2
                method = "gauss-seidel-bisection"
        _, _, sA, sB, rA, rB, _, _, S = self._state(DA, DB, muA, muB, u0A, u0B)
        lam = (self.L * sA, self.L * sB)
        rho = (min(rA, P.rho_max), min(rB, P.rho_max))
        return FixedPoint(lam, (DA, DB), rho, (rA, rB), math.log(S), it, res, ok, method)

    def _newton(self, muA, muB, u0A, u0B):
        """Damped Newton on F(D) = D - g(rho(D)) = 0 with backtracking and box [d0, D_max]."""
        P, L, c = self.P, self.L, self.P.c
        lo, hi = P.d0, self.D_max
        DA = DB = P.d0
        norm = INF
        for it in range(1, self.max_iter + 1):
            FA, FB, sA, sB, rA, rB, gpA, gpB, _ = self._state(DA, DB, muA, muB, u0A, u0B)
            norm = max(abs(FA), abs(FB))
            if norm < self.tol:
                return DA, DB, it, norm, True
            kA, kB = L / muA * c, L / muB * c
            J11 = 1.0 + gpA * kA * sA * (1.0 - sA)
            J12 = -gpA * kA * sA * sB
            J21 = -gpB * kB * sA * sB
            J22 = 1.0 + gpB * kB * sB * (1.0 - sB)
            det = J11 * J22 - J12 * J21
            stA = -(J22 * FA - J12 * FB) / det
            stB = -(-J21 * FA + J11 * FB) / det
            t = 1.0
            while True:
                nA = min(max(DA + t * stA, lo), hi)
                nB = min(max(DB + t * stB, lo), hi)
                nFA, nFB = self._state(nA, nB, muA, muB, u0A, u0B)[:2]
                if max(abs(nFA), abs(nFB)) < norm or t < 1e-6:
                    break
                t *= 0.5
            if nA == DA and nB == DB:
                break
            DA, DB = nA, nB
        return DA, DB, self.max_iter, norm, norm < self.tol * 100

    def _damped(self, muA, muB, u0A, u0B, alpha: float = 0.5, max_iter: int = 20000):
        """Plain damped fixed-point iteration D <- (1-a) D + a g(D) with adaptive damping.

        Slower than Newton (the map is stiff at high utilisation) but assumption-free;
        used in tests to confirm the Newton solution."""
        P = self.P
        DA = DB = P.d0
        prev = INF
        for it in range(1, max_iter + 1):
            FA, FB = self._state(DA, DB, muA, muB, u0A, u0B)[:2]
            norm = max(abs(FA), abs(FB))
            if norm < self.tol:
                return DA, DB, it, norm, True
            if norm > prev:
                alpha = max(alpha * 0.5, 1e-4)
            prev = norm
            DA = min(max(DA - alpha * FA, P.d0), self.D_max)
            DB = min(max(DB - alpha * FB, P.d0), self.D_max)
        return DA, DB, max_iter, norm, False

    def _gauss_seidel(self, muA, muB, u0A, u0B, sweeps: int = 200):
        """Fallback: each F_i is increasing in own D_i, so solve coordinate-wise by bisection."""
        P = self.P
        DA = DB = P.d0

        def solve_coord(i, other):
            lo, hi = P.d0, self.D_max
            for _ in range(80):
                mid = 0.5 * (lo + hi)
                F = self._state(mid, other, muA, muB, u0A, u0B)[0] if i == 0 else \
                    self._state(other, mid, muA, muB, u0A, u0B)[1]
                if F > 0:
                    hi = mid
                else:
                    lo = mid
            return 0.5 * (lo + hi)

        norm = INF
        for it in range(1, sweeps + 1):
            DA = solve_coord(0, DB)
            DB = solve_coord(1, DA)
            FA, FB = self._state(DA, DB, muA, muB, u0A, u0B)[:2]
            norm = max(abs(FA), abs(FB))
            if norm < 1e-7:
                return DA, DB, it, norm, True
        return DA, DB, sweeps, norm, False

    # ------------------------------------------------------------------ evaluation
    def _resolve_riders(self, wA, wB, NA, NB):
        if NA is not None and NB is not None:
            N0 = self.P.R - NA - NB
            if wA is None or wB is None:
                wA, wB = self.incentive_for_capacity(NA, NB)
            return wA, wB, NA, NB, N0
        NA, NB, N0 = self.rider_supply(wA, wB)
        return wA, wB, NA, NB, N0

    def profits(self, wA=None, wB=None, pA=None, pB=None, NA=None, NB=None) -> tuple[float, float]:
        """Fast path used inside optimisers: per-hour profit of A and B."""
        P = self.P
        pA = P.p if pA is None else pA
        pB = P.p if pB is None else pB
        wA, wB, NA, NB, _ = self._resolve_riders(wA, wB, NA, NB)
        fp = self.solve_fixed_point(P.k * NA, P.k * NB, pA, pB)
        cA = min(fp.lam[0], P.rho_max * P.k * NA)
        cB = min(fp.lam[1], P.rho_max * P.k * NB)
        return cA * (pA + P.m - wA) - P.F_A, cB * (pB + P.m - wB) - P.F_B

    def evaluate(self, wA=None, wB=None, pA=None, pB=None, NA=None, NB=None,
                 method: str = "newton") -> dict:
        """Full outcome (all metrics) for a strategy profile. Pass either (w_A, w_B) or (N_A, N_B)."""
        P = self.P
        pA = P.p if pA is None else pA
        pB = P.p if pB is None else pB
        wA, wB, NA, NB, N0 = self._resolve_riders(wA, wB, NA, NB)
        mu = (P.k * NA, P.k * NB)
        fp = self.solve_fixed_point(mu[0], mu[1], pA, pB, method=method)
        w, p, N = (wA, wB), (pA, pB), (NA, NB)
        completed = tuple(min(fp.lam[i], P.rho_max * mu[i]) for i in range(2))
        unserved = tuple(fp.lam[i] - completed[i] for i in range(2))
        F = (P.F_A, P.F_B)
        profit = tuple(completed[i] * (p[i] + P.m - w[i]) - F[i] for i in range(2))
        spend = tuple(completed[i] * w[i] for i in range(2))
        total_completed = sum(completed)
        total_unserved = sum(unserved)

        # Consumer surplus: logit log-sum (in INR via 1/b) for customers who are served or choose
        # the outside option, minus the part of the delay cost customers do not already perceive.
        # Delay is valued at `delay_cost` INR/min in welfare; the log-sum already charges c/b INR/min
        # (customers' own delay disutility), so only the difference is subtracted (no double counting).
        cs_logsum = (self.L - total_unserved) / P.b * fp.logsum
        base = P.d0 if P.delay_cost_basis == "excess" else 0.0
        unperceived = P.delay_cost - P.c / P.b
        delay_cost = unperceived * sum(completed[i] * (fp.D[i] - base) for i in range(2))
        cs = cs_logsum - delay_cost

        # Rider surplus: rider-side logit log-sum (per-order INR units) converted to INR/hour
        # with realised orders per active rider, so incentive payments are (approximately)
        # a transfer between platforms and riders.
        active = NA + NB
        kappa = total_completed / active if active > 0 else 0.0
        rs = kappa * P.R / P.beta * self.rider_logsum(wA, wB)

        total_profit = sum(profit)
        welfare = cs + total_profit + rs
        avg_delay = (sum(completed[i] * fp.D[i] for i in range(2)) / total_completed
                     if total_completed > 0 else self.D_max)
        return {
            "w": list(w), "p": list(p), "N": list(N), "N0": N0,
            "mu": list(mu), "demand": list(fp.lam), "completed": list(completed),
            "unserved": list(unserved), "rho": list(fp.rho), "rho_raw": list(fp.rho_raw),
            "delay": list(fp.D), "profit": list(profit), "incentive_spend": list(spend),
            "revenue": [completed[i] * (p[i] + P.m) for i in range(2)],
            "market_share": [lam / self.L for lam in fp.lam],
            "outside_share": 1.0 - sum(fp.lam) / self.L,
            "consumer_surplus": cs, "cs_logsum": cs_logsum, "delay_cost": delay_cost,
            "rider_surplus": rs, "orders_per_rider": kappa,
            "total_profit": total_profit, "total_welfare": welfare,
            "avg_delay": avg_delay, "total_completed": total_completed,
            "total_unserved": total_unserved, "total_incentive_spend": sum(spend),
            "fixed_point": fp.to_dict(),
        }

    def welfare(self, **kw) -> float:
        return self.evaluate(**kw)["total_welfare"]
