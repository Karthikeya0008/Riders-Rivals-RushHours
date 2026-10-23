"""Mid-level agent-based simulation of one zone's 3-hour dinner peak.

Purpose: (1) validate the analytical delay function D = d0 + s rho/(1-rho) against a
micro-level model with explicit riders, restaurants and travel; (2) produce frames for the
frontend animation.

Mechanics (one tick = 1 minute):
  * City: square grid (city_km x city_km); restaurants clustered in hotspots; customers placed
    within customer_radius_km of the chosen restaurant. Travel distance = Euclidean x road_factor.
  * Demand: Poisson arrivals with a rise-peak-fall rate curve whose mean equals the scenario's
    Lambda. Each customer chooses A, B or the outside option by the same logit as the analytical
    model, using each platform's fee and its *recently observed* delay (EWMA of deliveries).
  * Riders: R agents. At the start of every 15-minute block each rider re-chooses A, B or offline
    with the logit rule and the equilibrium incentives; busy riders switch after their delivery.
  * Dispatch: FIFO queue per platform; each order goes to the nearest idle rider of its platform.
    Rider timeline: travel to restaurant, wait for food (Gamma prep time, mean 12 min), travel to
    customer, handover. Orders unassigned after `patience_min` are cancelled.
"""
from __future__ import annotations

import heapq
import math
from collections import deque

import numpy as np
from scipy.optimize import curve_fit

OFFLINE, PA, PB = -1, 0, 1
IDLE, TO_REST, AT_REST, TO_CUST = 0, 1, 2, 3


def peak_curve(window: int, peak_factor: float) -> np.ndarray:
    """Per-minute demand multiplier: rise, peak, fall; mean 1, max = peak_factor."""
    t = np.arange(window) + 0.5
    g = np.exp(-((t - window / 2) / (window / 4.5)) ** 2)
    gbar = g.mean()
    x = (peak_factor - 1.0) / (1.0 - gbar)
    return 1.0 + x * (g - gbar)


class City:
    def __init__(self, sc: dict, rng: np.random.Generator):
        L = sc["city_km"]
        margin = 0.2 * L
        self.size = L
        self.hotspots = rng.uniform(margin, L - margin, size=(sc["hotspots"], 2))
        idx = rng.integers(0, sc["hotspots"], size=sc["restaurants"])
        self.restaurants = np.clip(self.hotspots[idx] + rng.normal(0, sc["hotspot_spread_km"],
                                                                     size=(sc["restaurants"], 2)), 0.2, L - 0.2)
        # popularity weights: bigger hotspots attract more orders
        self.weights = rng.gamma(2.0, 1.0, size=sc["restaurants"])
        self.weights /= self.weights.sum()


class Simulation:
    def __init__(self, sc: dict, market: dict, eq: dict, demand: float, seed: int,
                 record_frames: bool = True):
        self.sc = sc
        self.m = market
        self.rng = np.random.default_rng(seed)
        self.city = City(sc, np.random.default_rng(sc["seed"]))  # same city layout for all seeds
        self.demand = demand
        self.w = eq["w"]
        self.p = eq["p"]
        self.D_eq = eq["delay"]
        self.record = record_frames
        self.speed = sc["speed_kmh"] / 60.0  # km per minute
        R = int(market["R"])
        self.R = R
        # rider state
        hs = self.city.hotspots[self.rng.integers(0, len(self.city.hotspots), R)]
        near = hs + self.rng.normal(0, 2.0, size=(R, 2))
        uniform = self.rng.uniform(0, self.city.size, size=(R, 2))
        self.pos = np.where(self.rng.random((R, 1)) < 0.7, near, uniform).clip(0, self.city.size)
        # each rider's preferred waiting spot relative to the nearest hotspot (avoids riders piling up on a ring)
        self.home_offset = self.rng.normal(0, sc["hotspot_spread_km"], size=(R, 2))
        self.platform = np.full(R, OFFLINE)
        self.pending = np.full(R, -2)
        self.state = np.full(R, IDLE)
        self.free_at = np.zeros(R)
        self.leg = np.zeros((R, 8))  # x0,y0, xr,yr, xc,yc, t0, t_arrive_rest | plus timings below
        self.leg_t = np.zeros((R, 3))  # t_depart_rest, t_deliver, t_assign
        self.queues = [deque(), deque()]
        self.ewma = list(self.D_eq)
        self.deliveries = []  # heap of (t_deliver, platform, t_order) for the delay feedback
        self.frames = []

    # ---------------------------------------------------------------- behaviour rules
    def rider_choice(self, n: int) -> np.ndarray:
        beta, w0 = self.m["beta"], self.m["w0"]
        z = np.array([beta * w0, beta * self.w[0], beta * self.w[1]])
        pr = np.exp(z - z.max())
        pr /= pr.sum()
        return self.rng.choice([OFFLINE, PA, PB], size=n, p=pr)

    def customer_choice(self, n: int) -> np.ndarray:
        m = self.m
        u = np.array([m["a_A"] - m["b"] * self.p[0] - m["c"] * self.ewma[0],
                      m["a_B"] - m["b"] * self.p[1] - m["c"] * self.ewma[1]])
        e = np.exp(u)
        pr = np.array([1.0, e[0], e[1]]) / (1.0 + e.sum())
        return self.rng.choice([OFFLINE, PA, PB], size=n, p=pr)

    def position(self, t: float) -> np.ndarray:
        """Interpolated rider positions at time t (for animation frames)."""
        pos = self.pos.copy()
        busy = self.state != IDLE
        if not busy.any():
            return pos
        lg, lt = self.leg[busy], self.leg_t[busy]
        x0, xr, xc = lg[:, 0:2], lg[:, 2:4], lg[:, 4:6]
        t0, t_ar, t_dep, t_del = lg[:, 6], lg[:, 7], lt[:, 0], lt[:, 1]
        f1 = np.clip((t - t0) / np.maximum(t_ar - t0, 1e-9), 0, 1)[:, None]
        f2 = np.clip((t - t_dep) / np.maximum(t_del - t_dep, 1e-9), 0, 1)[:, None]
        p = np.where((t < t_ar)[:, None], x0 + f1 * (xr - x0),
                     np.where((t < t_dep)[:, None], xr, xr + f2 * (xc - xr)))
        pos[busy] = p
        return pos

    def phase(self, t: float) -> np.ndarray:
        ph = np.full(self.R, IDLE)
        busy = self.state != IDLE
        ph[busy & (t < self.leg[:, 7])] = TO_REST
        ph[busy & (t >= self.leg[:, 7]) & (t < self.leg_t[:, 0])] = AT_REST
        ph[busy & (t >= self.leg_t[:, 0])] = TO_CUST
        return ph

    # ---------------------------------------------------------------- main loop
    def run(self) -> dict:
        sc, m = self.sc, self.m
        W = int(sc["window_min"])
        curve = peak_curve(W, sc["peak_factor"])
        lam_per_min = self.demand / 60.0 * curve
        block = int(sc["block_min"])
        alpha = sc["delay_ewma"]
        patience = sc["patience_min"]
        rf = sc["road_factor"]
        prep_shape = sc["prep_shape"]
        prep_scale = sc["prep_mean_min"] / prep_shape
        handover = sc["handover_min"]
        size = self.city.size
        rest = self.city.restaurants
        per_min = []
        orders_log = []  # [platform, t_order, t_deliver or nan, cancelled]
        frame_every = max(1, int(sc["frame_every_min"]))

        for minute in range(W):
            t = float(minute)
            # 1. riders finishing deliveries become idle (and apply pending platform switches)
            done = (self.state != IDLE) & (self.free_at <= t)
            if done.any():
                self.pos[done] = self.leg[done, 4:6]
                self.state[done] = IDLE
                sw = done & (self.pending != -2)
                self.platform[sw] = self.pending[sw]
                self.pending[sw] = -2
            # 2. block start: riders re-choose platform via logit on incentives
            if minute % block == 0:
                choice = self.rider_choice(self.R)
                idle = self.state == IDLE
                self.platform[idle] = choice[idle]
                self.pending[~idle] = choice[~idle]
            # 3. arrivals
            n = self.rng.poisson(lam_per_min[minute])
            new_orders = {0: 0, 1: 0}
            if n:
                plat = self.customer_choice(n)
                r_idx = self.rng.choice(len(rest), size=n, p=self.city.weights)
                ang = self.rng.uniform(0, 2 * math.pi, n)
                rad = sc["customer_radius_km"] * np.sqrt(self.rng.random(n))
                cust = np.clip(rest[r_idx] + np.stack([rad * np.cos(ang), rad * np.sin(ang)], 1), 0, size)
                prep = self.rng.gamma(prep_shape, prep_scale, n)
                t_arr = t + self.rng.random(n)
                for k in range(n):
                    if plat[k] == OFFLINE:
                        continue
                    pk = int(plat[k])
                    rec = [pk, float(t_arr[k]), math.nan, False]
                    orders_log.append(rec)
                    self.queues[pk].append((float(t_arr[k]), rest[r_idx[k]], cust[k], float(prep[k]), rec))
                    new_orders[pk] += 1
            # 4. cancellations
            cancels = [0, 0]
            for pk in (0, 1):
                q = self.queues[pk]
                keep = deque()
                while q:
                    o = q.popleft()
                    if t - o[0] > patience:
                        o[4][3] = True
                        cancels[pk] += 1
                    else:
                        keep.append(o)
                self.queues[pk] = keep
            # 5. dispatch: FIFO, nearest idle rider of the platform
            for pk in (0, 1):
                q = self.queues[pk]
                while q:
                    cand = np.flatnonzero((self.platform == pk) & (self.state == IDLE))
                    if cand.size == 0:
                        break
                    t_o, r_xy, c_xy, prep_t, rec = q.popleft()
                    d = np.hypot(*(self.pos[cand] - r_xy).T)
                    j = cand[int(np.argmin(d))]
                    t0 = max(t, t_o)
                    t_ar = t0 + rf * d.min() / self.speed
                    t_dep = max(t_ar, t_o + prep_t)
                    t_del = t_dep + rf * float(np.hypot(*(c_xy - r_xy))) / self.speed + handover
                    self.leg[j] = [*self.pos[j], *r_xy, *c_xy, t0, t_ar]
                    self.leg_t[j] = [t_dep, t_del, t0]
                    self.state[j] = TO_REST
                    self.free_at[j] = t_del
                    rec[2] = t_del
                    heapq.heappush(self.deliveries, (t_del, pk, t_o))
            # 6. idle riders drift back towards the nearest hotspot
            if sc.get("idle_reposition", True):
                idle = (self.state == IDLE) & (self.platform != OFFLINE)
                if idle.any():
                    P = self.pos[idle]
                    dist = np.linalg.norm(P[:, None, :] - self.city.hotspots[None], axis=2)
                    tgt = np.clip(self.city.hotspots[np.argmin(dist, axis=1)] + self.home_offset[idle], 0, self.city.size)
                    vec = tgt - P
                    nrm = np.linalg.norm(vec, axis=1, keepdims=True)
                    step = np.minimum(self.speed * 0.5, np.maximum(nrm - 0.2, 0))
                    self.pos[idle] = P + np.where(nrm > 1e-9, vec / np.maximum(nrm, 1e-9), 0) * step
            # 7. per-minute metrics
            row = {"t": minute}
            for pk, name in ((0, "A"), (1, "B")):
                active = int(np.sum(self.platform == pk))
                idle = int(np.sum((self.platform == pk) & (self.state == IDLE)))
                row[f"active_{name}"] = active
                row[f"idle_{name}"] = idle
                row[f"queue_{name}"] = len(self.queues[pk])
                row[f"orders_{name}"] = new_orders[pk]
                row[f"cancel_{name}"] = cancels[pk]
                row[f"busy_{name}"] = active - idle
            row["offline"] = int(np.sum(self.platform == OFFLINE))
            row["lambda_total"] = float(lam_per_min[minute] * 60)
            per_min.append(row)
            if self.record and minute % frame_every == 0:
                self._frame(t)
            # 8. customers' delay perception: EWMA over deliveries completed by the end of this minute
            while self.deliveries and self.deliveries[0][0] <= t + 1:
                t_d, pk, t_o = heapq.heappop(self.deliveries)
                self.ewma[pk] = (1 - alpha) * self.ewma[pk] + alpha * (t_d - t_o)
        return self._summarise(per_min, orders_log, W)

    def _frame(self, t):
        pos = self.position(t)
        ph = self.phase(t)
        on = self.platform != OFFLINE
        riders = np.column_stack([np.flatnonzero(on), np.round(pos[on] * 10).astype(int), self.platform[on], ph[on]])
        orders = []
        for pk in (0, 1):
            for o in self.queues[pk]:
                orders.append([int(round(o[1][0] * 10)), int(round(o[1][1] * 10)), pk, 0])
        busy = (self.state != IDLE)
        if busy.any():
            dest = self.leg[busy, 4:6]
            plat = self.platform[busy]
            # riders that switched platforms keep delivering for the platform they were on
            for (x, y), pk in zip(dest, plat):
                orders.append([int(round(x * 10)), int(round(y * 10)), int(max(pk, 0)), 1])
        self.frames.append({"t": t, "riders": riders.ravel().tolist(), "orders": [v for o in orders for v in o]})

    # ---------------------------------------------------------------- analysis
    def _summarise(self, per_min, orders_log, W):
        m = self.m
        arr = np.array([[o[0], o[1], o[2], o[3]] for o in orders_log], dtype=float) if orders_log else np.zeros((0, 4))
        out = {"per_minute": per_min}
        delays_by_min = {0: np.full(W, np.nan), 1: np.full(W, np.nan)}
        analytic_by_min = {0: np.full(W, np.nan), 1: np.full(W, np.nan)}
        rho_by_min = {0: np.full(W, np.nan), 1: np.full(W, np.nan)}
        summary = {}
        for pk, name in ((0, "A"), (1, "B")):
            sel = arr[arr[:, 0] == pk] if len(arr) else arr
            delivered = sel[~np.isnan(sel[:, 2])] if len(sel) else sel
            delay = delivered[:, 2] - delivered[:, 1] if len(delivered) else np.array([])
            # per-minute simulated delay by order placement minute (5-minute centred smoothing)
            if len(delivered):
                mins = np.floor(delivered[:, 1]).astype(int)
                for mm in range(W):
                    s = (mins >= mm - 2) & (mins <= mm + 2)
                    if s.sum() >= 3:
                        delays_by_min[pk][mm] = delay[s].mean()
            # steady-state delay formula at the realised utilisation rho(t) = lambda(t) / (k N(t))
            # (used for the scatter / fitted curve; the quasi-static comparison is added by the runner)
            orders = np.array([r[f"orders_{name}"] for r in per_min], float)
            active = np.array([r[f"active_{name}"] for r in per_min], float)
            kernel = np.ones(15) / 15
            lam_h = np.convolve(orders, kernel, mode="same") * 60.0
            act = np.convolve(active, kernel, mode="same")
            rho = np.where(act > 0, lam_h / (m["k"] * np.maximum(act, 1e-9)), np.nan)
            rho_by_min[pk] = rho
            rc = np.minimum(rho, m["rho_max"])
            analytic_by_min[pk] = m["d0"] + m["s"] * rc / (1 - rc)
            n_orders = len(sel)
            summary[name] = {
                "orders": int(n_orders),
                "delivered": int(len(delivered)),
                "cancelled": int(sel[:, 3].sum()) if len(sel) else 0,
                "in_progress": int(n_orders - len(delivered) - (sel[:, 3].sum() if len(sel) else 0)),
                "mean_delay": float(delay.mean()) if len(delay) else None,
                "p90_delay": float(np.percentile(delay, 90)) if len(delay) else None,
                "mean_active_riders": float(active.mean()),
                "mean_rho": float(np.nanmean(rho)),
                "analytic_rho_mean_delay": float(np.nanmean(analytic_by_min[pk][np.isfinite(delays_by_min[pk])]))
                if np.isfinite(delays_by_min[pk]).any() else None,
                "equilibrium_delay": float(self.D_eq[pk]),
            }
        for pk, name in ((0, "A"), (1, "B")):
            for r, v_sim, v_an, v_rho in zip(per_min, delays_by_min[pk], analytic_by_min[pk], rho_by_min[pk]):
                r[f"sim_delay_{name}"] = None if not np.isfinite(v_sim) else float(v_sim)
                r[f"analytic_rho_delay_{name}"] = None if not np.isfinite(v_an) else float(v_an)
                r[f"rho_{name}"] = None if not np.isfinite(v_rho) else float(v_rho)
        out["summary"] = summary
        out["frames"] = self.frames
        return out


def _fit_delay_curve(rhos: np.ndarray, delays: np.ndarray, d0: float, s: float) -> dict:
    ok = np.isfinite(rhos) & np.isfinite(delays) & (rhos < 0.95) & (rhos > 0)
    if ok.sum() < 10:
        return {"d0": None, "s": None, "points": int(ok.sum())}
    f = lambda r, a, b: a + b * r / (1 - r)  # noqa: E731
    try:
        (a, b), _ = curve_fit(f, rhos[ok], delays[ok], p0=[d0, s])
    except Exception:  # pragma: no cover
        return {"d0": None, "s": None, "points": int(ok.sum())}
    return {"d0": float(a), "s": float(b), "points": int(ok.sum())}


def error_metrics(per_minute: list) -> dict:
    sims, ans = [], []
    for r in per_minute:
        for name in ("A", "B"):
            if r.get(f"sim_delay_{name}") is not None and r.get(f"analytic_delay_{name}") is not None:
                sims.append(r[f"sim_delay_{name}"])
                ans.append(r[f"analytic_delay_{name}"])
    if not sims:
        return {"mae": None, "mape": None, "bias": None, "n": 0}
    sims, ans = np.array(sims), np.array(ans)
    return {"mae": float(np.mean(np.abs(sims - ans))),
            "mape": float(np.mean(np.abs(sims - ans) / ans)),
            "bias": float(np.mean(sims - ans)), "n": int(len(sims))}
