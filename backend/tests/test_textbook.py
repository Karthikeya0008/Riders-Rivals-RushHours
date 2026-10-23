"""Textbook sanity cases solved with the same generic solvers the market models use."""
import pytest

from engine.solvers import deviation_check, nash_br_iteration, stackelberg

A, B, C = 100.0, 1.0, 10.0  # inverse demand P = A - B Q, marginal cost C


def linear_cournot_payoff(i, q):
    return q[i] * (A - B * (q[0] + q[1]) - C)


def bounds(i, q):
    return 0.0, (A - C) / B


def test_linear_cournot_equilibrium_is_a_minus_c_over_3b():
    ne = nash_br_iteration(linear_cournot_payoff, bounds, [5.0, 60.0])
    assert ne.converged
    assert ne.x[0] == pytest.approx((A - C) / (3 * B), abs=1e-4)
    assert ne.x[1] == pytest.approx((A - C) / (3 * B), abs=1e-4)
    assert deviation_check(linear_cournot_payoff, ne.x, bounds)["passed"]


def test_linear_stackelberg_leader_output_is_a_minus_c_over_2b():
    st = stackelberg(linear_cournot_payoff, bounds, leader=0)
    assert st["x"][0] == pytest.approx((A - C) / (2 * B), abs=1e-3)
    assert st["x"][1] == pytest.approx((A - C) / (4 * B), abs=1e-3)
    # first-mover advantage: leader earns more than at the Cournot equilibrium
    q = (A - C) / (3 * B)
    assert st["leader_payoff"] > linear_cournot_payoff(0, [q, q])


def homogeneous_bertrand_payoff(i, p):
    own, rival = p[i], p[1 - i]
    demand = max(A - own, 0.0)
    if own < rival:
        return (own - C) * demand
    if own == rival:
        return 0.5 * (own - C) * demand
    return 0.0


def test_homogeneous_bertrand_converges_to_marginal_cost():
    step = 0.5
    grid = int((A - C) / step) + 1
    ne = nash_br_iteration(homogeneous_bertrand_payoff, lambda i, p: (C, A), [80.0, 75.0],
                           grid=grid, refine=False, max_iter=500, damping_schedule=(1.0,))
    assert ne.converged
    assert abs(ne.x[0] - C) <= step + 1e-9
    assert abs(ne.x[1] - C) <= step + 1e-9
