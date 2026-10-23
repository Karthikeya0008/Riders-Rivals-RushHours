# Assumptions and default parameters

Every default lives in one file, [`backend/config/defaults.json`](../backend/config/defaults.json), and every
parameter can be overridden from the frontend (Playground sliders) or in any API request
(`{"params": {"market": {...}}}`). This document lists each assumption, its default, and why it was chosen.
Assumptions marked **(changed from brief)** deviate from the original project brief; the reason is given in full.

---

## A. Calibration change to the shared market environment

### A1. Base platform attractiveness `a_A = a_B = 4.0` (brief: 1.0) **(changed from brief)**

**The exact reason.** With the brief's value `a = 1.0`, a customer's utility from either platform at the fixed fee
`p = 35` and the minimum possible delay `d0 = 28` minutes is

```
u = a − b·p − c·D = 1.0 − 0.05·35 − 0.08·28 = −2.99
```

while the outside option (not ordering) has utility 0. The logit share of each platform is then
`e^{−2.99} / (1 + 2e^{−2.99}) ≈ 4.6 %`, so the two platforms together receive only **≈ 8 % of Λ in every scenario**,
even at the lowest possible delay. We solved the incentive (Bertrand) equilibrium with all other parameters exactly as
specified:

| Λ (orders/h) | w* (₹/order) | riders per platform | utilisation ρ | delay | platforms' share of Λ |
|---|---|---|---|---|---|
| 600  | 12.9 | 61  | 0.18 | 29.4 min | 8.3 % |
| 1000 | 16.7 | 92  | 0.20 | 29.5 min | 8.2 % |
| 1500 | 20.1 | 123 | 0.22 | 29.7 min | 8.1 % |
| 2000 | 22.9 | 148 | 0.24 | 29.9 min | 7.9 % |

Under the brief's numbers **there is no peak congestion and no incentive war**. Platforms serve 25–80 orders/hour out of a
1,100-order/hour rider capacity. Delay never moves more than 2 minutes above d0. Equilibrium incentives sit *below*
the riders' reservation incentive w0 = 25, and most riders stay offline. None of the research questions can be studied
in that regime: delay cannot respond to incentives because it is already at its floor.

With `a = 4.0`, everything else unchanged, the base utility is
`4.0 − 1.75 − 2.24 ≈ 0`, so at the minimum delay a customer is roughly indifferent between ordering and not.
Platforms then capture 38–61 % of Λ. Utilisation rises from 0.36 (Low) to 0.72 (Extreme), and delay from 31 to 43
minutes. Equilibrium incentives (₹37–63) exceed w0. The rider pool is nearly exhausted at ~250 riders per platform,
so further incentive increases mostly steal riders from the rival. This is the regime described in the problem
statement. We also checked a = 3.5 (similar, slightly less congested) and a = 4.5 (very congested, profit regime
switches at Peak). We chose a = 4.0 as the middle option. a is a pure level shift in the logit, so no equation changes;
it remains a slider on the Playground.

### A2. Dominant-platform toggle: `a_A = a_B + 0.2`

The brief's toggle raised a_A from 1.0 to 1.2. We keep the same **+0.2 difference** on the new base (4.2 vs 4.0).
It is the `dominant_bonus` parameter.

---

## B. Market primitives (as in the brief)

| Parameter | Default | Justification |
|---|---|---|
| Time unit | one peak hour in one city zone | brief |
| Λ scenarios | Low 600, Medium 1000, Peak 1500, Extreme 2000 orders/h | brief; Λ is the *potential* order flow, part of which chooses the outside option |
| R | 500 multi-homing riders | brief |
| w0 | ₹25 per order | brief; riders' reservation incentive (outside gig work) |
| β | 0.15 per ₹ | brief; a ₹6.7 incentive gap multiplies the odds of joining a platform by e |
| k | 2.2 orders per rider-hour | brief; matches a ~27-minute rider cycle (validated by the simulation) |
| ρ_max | 0.97 | brief; utilisation cap, orders beyond ρ_max·μ are unserved |
| d0, s | 28 min, 6 min | brief |
| b, c | 0.05 per ₹, 0.08 per min | brief; customers value one minute of delay at c/b = ₹1.6 |
| m | ₹45 commission per order | brief |
| p | ₹35 fixed delivery fee | brief (used whenever fees are not strategic) |
| F_A, F_B | ₹0 | brief; fixed costs do not affect equilibria, only profit levels |
| Delay cost h | ₹3 per minute per order | brief; see C1 for how it enters welfare |

## C. Welfare definitions

### C1. Delay cost applies to *congestion* delay, net of what customers already perceive
The brief says "consumer surplus via logit log-sum, minus delay cost (₹3 per minute of delay per order)".
Taken literally, this double counts. The logit log-sum already includes the delay disutility customers perceive when
they choose (c/b = ₹1.6 per minute), and subtracting ₹3/min on top values delay at ₹4.6/min. It also charged ₹84 per
order for the unavoidable 28-minute base delay. That makes consumer surplus negative even in the Low scenario and
pushed the social planner to shut a platform down at Extreme demand. We therefore define:

```
CS = (Λ − U)/b · ln(1 + Σ e^{u_j})  −  (h − c/b) · Σ_i completed_i · (D_i − d0)
```

so that **total** social cost of congestion delay is exactly h = ₹3/min: ₹1.6 perceived by customers (inside the
log-sum) plus ₹1.4 unperceived (food quality, restaurant reputation, externality on other customers). d0 is the
service standard and is treated as part of the product whose value is captured by a_i. Setting
`delay_cost_basis = "total"` in the config restores delay costs on the full delay.
The efficiency *ranking* of fee-setting vs fixed-fee structures at peak demand depends on h (see
[SELF_REVIEW.md](SELF_REVIEW.md)); the collusion-is-worst and incentive-competition-best-at-Medium results do not.

### C2. Unserved customers
Customers whose order is cancelled (beyond ρ_max·μ) receive the outside option, so the log-sum is applied to
Λ − U customers. Under the default calibration, delay rations demand before the cap binds, so U ≈ 0. The cap does bind
when customers are insensitive to delay; this is covered by a test.

### C3. Rider surplus
The brief asks for a rider-side log-sum. The rider logit index is a per-order incentive, so the log-sum
`(R/β) ln(1 + Σ e^{β(w_j − w0)})` is in "₹ per order-equivalent". We convert it to ₹/hour with
κ = realised orders per active rider (Σ completed / (N_A + N_B)). With this conversion, incentive payments are
(approximately) a transfer between platforms and riders. Once the rider pool is exhausted, extra incentive moves
profit to rider surplus one-for-one, which we verified numerically (welfare is flat in w above ≈ ₹45).

### C4. Restaurants are outside the welfare function
The commission m counts as platform revenue; restaurant surplus is not modelled.

### C5. Social planner benchmark
The planner chooses **incentives and fees for both platforms** (all instruments any model gives the platforms),
within the same bounds (w ∈ [0, 100], p ∈ [0, 120]). Its welfare is therefore an upper bound for every model, so
efficiency ≤ 1 and PoA ≥ 1 everywhere (enforced by a test). Above pool exhaustion, welfare is flat in w. A tie-break of
₹0.001 per ₹ of incentive spend then selects the smallest such incentive, so the reported planner incentive is
well defined. A fixed-fee planner (w only, p = 35) is also reported to separate fee and incentive effects.

### C6. Collusion benchmark
An incentive cartel: joint-profit maximisation over (w_A, w_B) at the regulated fee p = 35. This is the cooperative
outcome of the repeated incentive game.

## D. Game-model choices

| Assumption | Choice | Reason |
|---|---|---|
| Bertrand on fees: fixed capacity | Both platforms pay w = w0 = ₹25, so N = R/3 ≈ 167 each | A neutral capacity not taken from any other model's equilibrium; configurable (`fee_game.fixed_incentive`) |
| Homogeneous Bertrand | β raised to 5 (`beta_homogeneous`) | Near winner-take-all rider choice; excluded from the cross-model comparison because it changes the environment |
| Stackelberg leader | Platform A | Brief; both capacity and incentive leadership are solved |
| First-mover advantage | Leader profit − its profit in the simultaneous game with the same strategic variable (Cournot or Bertrand-incentive) | Brief |
| Two-stage game | Capacity N_i first (incentive from inverse supply), then fees | Brief; the fee subgame is re-solved for every capacity pair |
| Strategy bounds | w ∈ [0, 100], p ∈ [0, 120], N_i ≥ 1, N_0 ≥ 1 | w ≤ 100 exceeds the ₹80 per-order margin; N_0 ≥ 1 keeps the inverse supply finite |
| Matrix game levels | Low = collusive incentive, High = best one-shot deviation against Low, Medium = midpoint | With "High = one-shot Nash incentive", the jump from Low to High is unprofitable at Medium+ demand (stag-hunt structure). The economically relevant defection is the *optimal* deviation, which also makes the repeated game's T, R, P, S consistent. Levels are editable in the UI |
| Repeated game stage | 2×2 {Low, High} game above; one stage = one day's peak hour | π_dev = T, π_coop = R, π_Nash = P (mutual defection); δ* with Nash reversion to the continuous Bertrand equilibrium is also reported |
| Repeated-game defaults | T = 60 days, δ = 0.9, GTFT generosity 0.3, 200 replications, seed 7 | Typical tournament settings |
| Noise | A cooperative move is observed as defection with probability ε, independently for each observer | Brief |
| Bayesian types | Own attractiveness a_i ± 0.3, independent across platforms, prior P(High) = 0.5 | "Own demand High/Low" maps to the platform's logit attractiveness; Λ is shared |

## E. Numerical methods

| Item | Choice | Reason |
|---|---|---|
| Demand–delay fixed point | Damped Newton with backtracking on F(D) = D − g(ρ(D)), box [d0, D_max]; fallback coordinate bisection | Plain damped iteration is stiff at high ρ (needs damping < 0.07); Newton converges in < 10 steps. Plain damped iteration is kept and tested to give the same solution |
| Best responses | Global grid (61 points) + bounded Brent refinement | Profits can be non-concave in own strategy (the Extreme scenario has two local optima); a local optimiser alone returned the wrong branch |
| NE computation | Gauss–Seidel BR iteration; retries with damping 0.5, 0.25 if it cycles | Standard |
| Deviation check | 401-point grid + local polish per player; pass if gain ≤ max(₹1, 0.1 % of payoff) | Brief requires a fine-grid unilateral-deviation check for every equilibrium |
| Joint optima | Multi-start Powell seeded from the best points of a coarse grid; verified on an independent grid | |
| Mixed NE | Support enumeration (equal-size supports) plus pure NE | Exact for non-degenerate small games |
| Strict dominance | By pure strategies, then by mixtures (LP) | Textbook IESDS |
| Caching | In-memory, keyed by a hash of the full configuration and request | No database needed |

## F. Agent-based simulation

| Parameter | Default | Reason |
|---|---|---|
| City | 20 × 20 km, 40 restaurants in 5 hotspots (σ = 1.2 km) | Brief |
| Customers | Uniform in a 5 km disc around the chosen restaurant | Gives a mean drop distance of 3.3 km |
| Travel | Euclidean × 1.3 road factor at 20 km/h | Urban two-wheeler speed |
| Prep time | Gamma(shape 4, mean 12 min) | Brief (mean 12) |
| Handover | 2 min | |
| Calibration check | Unloaded delivery ≈ 12 (prep) + 13 (drop) + 2 = 27–28 min ≈ d0; rider cycle ≈ 27 min ⇒ ≈ 2.2 orders/rider-hour ≈ k | So the simulation's physics match the analytical primitives without fitting |
| Peak window | 180 min; Gaussian rise-peak-fall, mean = Λ, peak = 1.35 Λ | Brief |
| Rider choice | Logit over A/B/offline every 15 min with the equilibrium incentives; busy riders switch after their delivery | Brief |
| Customer choice | Same demand logit with the platform's EWMA of realised delays (α = 0.05) | Closes the demand–delay loop dynamically |
| Dispatch | FIFO; nearest idle rider of that platform; idle riders drift back towards hotspots | |
| Patience | Cancel if unassigned after 20 min | Brief |
| Seeds | Display run seed 42; Monte Carlo seeds 43–62 (20 runs) | Brief |
| Frames | One per minute, rider id + position (0.1 km resolution) + platform + phase | Payload ≤ 3.7 MB at Extreme demand with 20 MC runs (< 5 MB) |
| Analytical comparison | Fixed point re-solved at each minute's Λ(t) (quasi-static) | A steady-state formula at the instantaneous ρ(t) explodes during transient overload; the quasi-static fixed point includes the demand response |
