"""Bertrand competition, on rider incentives (riders split by logit) or on customer fees
(capacity fixed)."""
from __future__ import annotations

from .common import const_bounds, deviation_kw, make_env, package, solver_kw
from .solvers import br_curves, deviation_check, nash_br_iteration


def incentive_game(env, cfg):
    def payoff(i, x):
        return env.profits(wA=x[0], wB=x[1])[i]
    return payoff, const_bounds(cfg["bounds"]["w"])


def fee_game(env, cfg, w_fixed: float):
    def payoff(i, x):
        return env.profits(wA=w_fixed, wB=w_fixed, pA=x[0], pB=x[1])[i]
    return payoff, const_bounds(cfg["bounds"]["p"])


def solve_bertrand_incentive(cfg: dict, scenario, curves: bool = True,
                             homogeneous: bool = False) -> dict:
    if homogeneous:
        env = make_env(cfg, scenario, beta=cfg["market"]["beta_homogeneous"])
    else:
        env = make_env(cfg, scenario)
    payoff, bounds = incentive_game(env, cfg)
    kw = solver_kw(cfg)
    if homogeneous:
        # Near winner-take-all rider choice makes BR jump; use a finer global grid.
        kw["grid"] = 401
    w0 = env.P.w0
    ne = nash_br_iteration(payoff, bounds, [w0, w0], **kw)
    check = deviation_check(payoff, ne.x, bounds, **deviation_kw(cfg))
    out = env.evaluate(wA=ne.x[0], wB=ne.x[1])
    rng = tuple(cfg["bounds"]["w"])
    brc = br_curves(payoff, bounds, (rng, rng), cfg["solver"]["curve_points"],
                    grid=kw["grid"]) if curves else None
    margin = env.P.p + env.P.m
    if homogeneous:
        model, label = "bertrand_homogeneous", "Homogeneous Bertrand (incentives)"
        notes = [
            f"Riders are near-perfect substitutes between platforms (beta = {env.P.beta:g}): the "
            "platform paying slightly more attracts almost the whole pool.",
            f"Each platform outbids the other until the incentive approaches the full per-order "
            f"margin p + m = {margin:g} INR. Profits collapse towards zero: the Bertrand paradox, "
            "here on the input (rider) side rather than the output price.",
            "This variant changes beta, so it is shown for illustration and excluded from the "
            "cross-model comparison.",
        ]
    else:
        model, label = "bertrand_incentive", "Bertrand (incentives)"
        notes = [
            "Each platform sets its per-order rider incentive w_i; riders split by logit.",
            "Raising w_i pulls riders from the rival as well as from the outside option, which "
            "raises the rival's delay. This business-stealing effect drives the incentive war.",
        ]
    return package(model, label, scenario, env, out, "w", ne.x, check, ne.info(), brc, notes,
                   {"margin_per_order": margin})


def solve_bertrand_fee(cfg: dict, scenario, curves: bool = True) -> dict:
    env = make_env(cfg, scenario)
    w_fixed = float(cfg["fee_game"]["fixed_incentive"])
    payoff, bounds = fee_game(env, cfg, w_fixed)
    p0 = env.P.p
    ne = nash_br_iteration(payoff, bounds, [p0, p0], **solver_kw(cfg))
    check = deviation_check(payoff, ne.x, bounds, **deviation_kw(cfg))
    out = env.evaluate(wA=w_fixed, wB=w_fixed, pA=ne.x[0], pB=ne.x[1])
    rng = tuple(cfg["bounds"]["p"])
    brc = br_curves(payoff, bounds, (rng, rng), cfg["solver"]["curve_points"]) if curves else None
    notes = [
        f"Capacity is fixed: both platforms pay w = {w_fixed:g} INR/order, so each keeps "
        f"N = {out['N'][0]:.0f} riders. Platforms compete only on the customer fee p_i.",
        "Because delay rises with orders, a platform that cuts its fee attracts customers but "
        "also congests its own fleet. Capacity limits soften price competition (Edgeworth).",
    ]
    return package("bertrand_fee", "Bertrand (fees)", scenario, env, out, "p", ne.x, check,
                   ne.info(), brc, notes, {"fixed_incentive": w_fixed})
