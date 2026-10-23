# Self-review: are the model comparisons consistent?

The brief requires that every model use exactly the same market environment, so that cross-model comparisons are valid.
This review checks which comparisons are strictly like-for-like and which carry a caveat.

## What is guaranteed by construction

- **One environment.** Every model (and the simulation) evaluates outcomes through `MarketEnvironment.evaluate` /
  `profits` with the same parameters from `config/defaults.json`. The same rider supply curve (logit and its exact
  inverse), capacity, delay function, demand logit, fixed-point solver, profit and welfare formulas are used everywhere.
  No model has its own copy of any formula.
- **Same strategy bounds** (w ∈ [0, 100], p ∈ [0, 120], N ≥ 1, N₀ ≥ 1) for every model and for the planner.
- **Same equilibrium verification** for every model and scenario (all 32 pass), using the same grid and tolerance.
- **Same welfare accounting** (CS, RS, W) for every model, so efficiency and PoA share one denominator: the planner
  optimum over all instruments. Efficiency ≤ 1 in every cell, which is enforced by a test.

## Comparisons that hold different things fixed (caveats to state in the report)

1. **Instrument sets differ by design.** Cournot, Bertrand-incentive, both Stackelberg variants and collusion keep the
   fee at p = ₹35; Bertrand-on-fees keeps capacity at w = w0 (N = R/3); the two-stage game lets platforms choose both
   capacity and fees. Part of the two-stage game's high efficiency at Extreme demand therefore comes from **fee
   flexibility** (congestion pricing), not from the timing alone. When comparing "capacity-then-fees" with Cournot,
   the like-for-like comparison is **capacity** (within 0.7%), not welfare.
2. **The fixed capacity in Bertrand-on-fees is exogenous.** Its outcomes depend on the chosen w = w0. It is a neutral
   choice, since it is not taken from another model's equilibrium, but a different fixed capacity would move its row in
   the comparison. It is configurable (`fee_game.fixed_incentive`).
3. **Planner vs fixed-fee models.** Because the planner may also set fees, the efficiency loss of fixed-fee models
   combines the *incentive* distortion and the *fee* distortion. The planner result also reports a **fixed-fee planner**
   (incentives only, p = ₹35) to separate the two.
4. **Homogeneous Bertrand changes β.** It is a deliberate one-parameter change (β = 5) used only to demonstrate the
   Bertrand paradox. It is excluded from the comparison table, and its efficiency is reported as n/a.
5. **Bayesian Cournot changes a_i by type.** It is compared only with complete-information Cournot under the same type
   profiles, never with the symmetric baseline rows.
6. **Two values of δ\*.** The repeated game's δ\* uses the 2×2 stage game (cooperate = collusive w, defect = best
   deviation, punishment = mutual defection), which the simulated strategies actually play. δ\* with Nash reversion
   uses the continuous Bertrand equilibrium as punishment. Both are internally consistent, both are reported, and they
   are labelled separately.

## Approximations that affect levels, not rankings

- **Rider surplus** converts the per-order logit log-sum to INR/h using realised orders per active rider (κ), which
  varies slightly across models. Incentive payments therefore cancel only approximately between profit and rider
  surplus at moderate utilisation; they cancel one-for-one once the pool is exhausted (numerically verified). Welfare
  levels inherit this approximation.
- **Delay cost** is applied to congestion delay above d0, net of what customers already perceive. The *efficiency
  ranking is sensitive to this valuation h*. We re-solved all 32 cells for three values:

  | Social cost of delay h | Top structure (Low / Medium / Peak / Extreme) | Bottom structure |
  |---|---|---|
  | ₹1.6/min (= customers' own c/b; no unperceived cost) | Two-stage / Bertrand-inc. / Bertrand-inc. / Bertrand-inc. | Collusion or Bertrand-fee |
  | **₹3/min (default, brief)** | Bertrand-inc. / Bertrand-inc. / Bertrand-inc. / **Two-stage** | Collusion or Bertrand-fee |
  | ₹5/min | Bertrand-inc. / Bertrand-inc. / **Two-stage** / **Two-stage** | Collusion or Bertrand-fee |

  **Robust across h:** the incentive cartel (collusion) is always among the least efficient structures, and
  incentive competition is the most efficient at Medium demand. **Not robust:** whether fee-setting structures
  (two-stage, Bertrand-on-fees) beat fixed-fee competition at peak. The more society values delay, the more fees'
  congestion-pricing role matters. Statements such as "two-stage is the most efficient structure at Extreme demand"
  should be reported together with the assumed h.

## The simulation vs the analytical model

The simulation shares β, w, p, a, b, c, R, the scenario Λ and the logit rules with the analytical model, but has its own
delay physics (travel, prep, dispatch) by design. This is what makes it a validation. Its peak curve varies Λ over the
window, so the analytical benchmark is the fixed point re-solved at each minute's Λ(t). The comparison shows the
analytical delay function is **conservative at moderate load** (it overstates delay by 4–7 minutes) and **close at
peak** (within 7%). It also shows the simulation cancels orders at Extreme demand, whereas the analytical model rations
through delay. Both differences are reported, not tuned away.

## Verdict

No comparison in the Comparison page, the Insights page or RESULTS.md mixes two different market environments. The
only differences between rows are the instruments and the timing, which is the object of study. Caveats 1–3 should be
stated whenever welfare or efficiency is compared between fixed-fee and fee-setting structures.
