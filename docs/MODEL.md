# Mathematical formulation

All models share one environment (`backend/engine/market.py`). Two platforms $i \in \{A, B\}$; one peak hour in one
city zone; money in INR. Notation for the rival is $j \neq i$.

## 1. Shared market environment

**Rider supply.** $R$ multi-homing riders choose platform A, platform B or an outside option (reservation incentive
$w_0$ per order) by logit with sensitivity $\beta$:

$$N_i = R\,\frac{e^{\beta w_i}}{e^{\beta w_0} + \sum_{j} e^{\beta w_j}}, \qquad N_0 = R - N_A - N_B .$$

**Inverse supply** (used when a platform chooses capacity $N_i$ instead of $w_i$; identical curve):

$$w_i = w_0 + \frac{1}{\beta}\ln\frac{N_i}{N_0}.$$

**Capacity and utilisation.** $\mu_i = k N_i$, $\;\rho_i = \min(\lambda_i/\mu_i,\ \rho_{\max})$.

**Delay** (queueing form): $D_i = d_0 + s\,\dfrac{\rho_i}{1-\rho_i}$ minutes. Orders beyond $\rho_{\max}\mu_i$ are unserved:
$\text{completed}_i = \min(\lambda_i, \rho_{\max}\mu_i)$, $U = \sum_i (\lambda_i - \text{completed}_i)$.

**Customer demand** (logit with outside option, delay-sensitive):

$$\lambda_i = \Lambda \frac{e^{u_i}}{1+\sum_j e^{u_j}}, \qquad u_i = a_i - b\,p_i - c\,D_i .$$

**Demand–delay fixed point.** $D$ depends on $\lambda$ and $\lambda$ on $D$. Define $g_i(D) = d_0 + s\,\tilde\rho_i/(1-\tilde\rho_i)$
with $\tilde\rho_i = \min(\lambda_i(D)/\mu_i, \rho_{\max})$ and solve $F(D) = D - g(D) = 0$ on $[d_0, D_{\max}]^2$,
$D_{\max} = d_0 + s\rho_{\max}/(1-\rho_{\max})$. $F_i$ is strictly increasing in $D_i$ (the left side rises, demand
and hence $g_i$ fall), so the solution is unique for each own-delay coordinate. We use damped Newton iteration
$D \leftarrow D - t J^{-1}F(D)$ with the analytic Jacobian

$$J_{ii} = 1 + g_i'\,\frac{\Lambda c}{\mu_i}\sigma_i(1-\sigma_i), \qquad J_{ij} = -g_i'\,\frac{\Lambda c}{\mu_i}\sigma_i\sigma_j, \qquad g_i' = \frac{s}{(1-\rho_i)^2}\ (0 \text{ above the cap}),$$

where $\sigma_i = \lambda_i/\Lambda$ and $t$ is halved until the residual decreases. A coordinate-wise bisection fallback and a plain damped
iteration $D \leftarrow (1-\alpha)D + \alpha g(D)$ (used in tests) give the same solution. Convergence (residual
$< 10^{-9}$) is reported with every result.

**Profit.** $\pi_i = \text{completed}_i\,(p_i + m - w_i) - F_i$; incentive spend $= \text{completed}_i\, w_i$.

**Welfare.**

$$CS = \frac{\Lambda - U}{b}\ln\Big(1+\sum_j e^{u_j}\Big) - \Big(h - \frac{c}{b}\Big)\sum_i \text{completed}_i\,(D_i - d_0)$$

$$RS = \kappa\,\frac{R}{\beta}\ln\Big(1 + \sum_j e^{\beta(w_j - w_0)}\Big), \qquad \kappa = \frac{\sum_i \text{completed}_i}{N_A + N_B}$$

$$W = CS + \pi_A + \pi_B + RS, \qquad \text{Efficiency} = \frac{W}{W^*}, \qquad \text{PoA} = \frac{W^*}{W}.$$

$h$ = ₹3/min is the social cost of congestion delay; the log-sum already contains the perceived part $c/b$ (see
ASSUMPTIONS C1). $W^*$ is the social-planner optimum (Section 2.6).

## 2. Continuous games

Each model returns equilibrium strategies, per-platform delay, orders completed, unserved orders, profit, incentive
spend, CS, RS, W, efficiency and PoA, plus a **deviation check** (Section 4).

### 2.1 Cournot (capacity)
Strategy $N_i \in [1,\ R - N_j - 1]$, fees fixed at $p$. Payoff $\pi_i(N_i, N_j)$ with $w_i(N)$ from the inverse supply.
NE: $N_i^* = BR_i(N_j^*)$ for both platforms, computed by Gauss–Seidel best-response iteration
$N_i^{(n+1)} = BR_i(N_j^{(n)})$. Best-response curves $BR_A(N_B)$ and $BR_B(N_A)$ are returned for plotting.

### 2.2 Bertrand on incentives
Strategy $w_i \in [0, 100]$; riders split by the logit; fees fixed. NE by best-response iteration.
**Homogeneous variant:** $\beta \to 5$ (riders are near-perfect substitutes). The platform paying more gets almost all
riders, so each outbids the other until $w^* \approx p + m$ and profits vanish. This is the Bertrand paradox on the
input side, analogous to price = marginal cost.

### 2.3 Bertrand on fees
Capacity fixed ($w = w_0$ for both, so $N = R/3$); strategy $p_i \in [0,120]$. Raising $p_i$ loses customers but lowers
own congestion, so capacity limits soften price competition.

### 2.4 Stackelberg
Leader A commits to $x_A$ ($N_A$ or $w_A$); follower B observes and plays $BR_B(x_A)$. Backward induction:

$$x_A^* = \arg\max_{x_A} \pi_A\big(x_A, BR_B(x_A)\big), \qquad \text{FMA} = \pi_A^{Stack} - \pi_A^{Nash}.$$

The outer maximisation is a global grid + Brent search; $BR_B$ is solved inside each evaluation.

### 2.5 Two-stage game (capacity, then fees)
Stage 2 (for given $N$): incentives fixed by the inverse supply, fees form a Nash equilibrium $p^*(N)$.
Stage 1: reduced-form profits $\Pi_i(N) = \pi_i(N, p^*(N))$; the subgame-perfect equilibrium is the NE of the
reduced game. The fee subgame is re-solved (warm-started, memoised) for every capacity pair visited. Kreps–Scheinkman:
capacity precommitment softens the price stage, so SPE capacities are close to Cournot capacities.

### 2.6 Benchmarks
Social planner: $\max_{w_A, w_B, p_A, p_B} W$ (all instruments, same bounds), so $W^* \ge W$ for every model.
Collusion: $\max_{w_A, w_B} (\pi_A + \pi_B)$ at the fixed fee. Both use multi-start Powell from the best
points of a coarse grid, verified on an independent grid.

## 3. Discrete, repeated and Bayesian games

### 3.1 Strategic form (Modules 2, 3, 6)
Incentive levels $\{L, M, H\}$: $L = w_c$ (collusive), $H = w_d = BR(w_c)$ (best one-shot deviation), $M$ = midpoint.
Payoffs are hourly profits from the environment.

* **Best responses / pure NE:** cell $(r,c)$ is a pure NE iff $r \in BR_A(c)$ and $c \in BR_B(r)$.
* **IESDS / IEWDS:** remove one dominated strategy per step, alternating players. Strict dominance is checked against
  pure strategies and against mixtures with the LP $\max \varepsilon$ s.t. $\sum_t \sigma_t P_{t\cdot} \ge P_{s\cdot} + \varepsilon$.
* **Mixed NE (support enumeration):** for supports $I, J$ with $|I| = |J|$, solve $\sum_{j\in J} A_{ij} q_j = v\ \forall i \in I$,
  $\sum q = 1$ (and symmetrically for $p$); keep solutions with $p, q \ge 0$ and no profitable action outside the support.
* **Maxmin:** pure $\max_r \min_c A_{rc}$; mixed via the LP $\max v$ s.t. $\sum_r x_r A_{rc} \ge v\ \forall c$.
* **Prisoner's Dilemma:** in the 2×2 $\{L, H\}$ game, $T > R > P > S$ for both players with
  $T = \pi(H, L)$, $R = \pi(L, L)$, $P = \pi(H, H)$, $S = \pi(L, H)$.

### 3.2 Repeated game (Module 7)
Grim trigger sustains cooperation iff $\frac{R}{1-\delta} \ge T + \frac{\delta P}{1-\delta}$, i.e.

$$\delta \ge \delta^* = \frac{\pi_{dev} - \pi_{coop}}{\pi_{dev} - \pi_{Nash}} = \frac{T - R}{T - P}.$$

We also report $\delta^*$ with Nash reversion to the continuous Bertrand equilibrium profit. Strategies simulated over
$T$ days: Always Defect, Always Cooperate, Grim Trigger, Tit-for-Tat, Generous TFT (forgive an observed defection with
probability $g$). Round-robin tournament with self-play; payoffs are normalised discounted averages
$\frac{1-\delta}{1-\delta^T}\sum_t \delta^t \pi_t$. Imperfect observability: a cooperative move is observed as defection
with probability $\varepsilon$, independently for each observer; noisy matches are averaged over 200 replications.

### 3.3 Bayesian Cournot (Module 5)
Types $\theta_i \in \{H, L\}$ i.i.d. with $P(H) = q$; type shifts own attractiveness $a_i \pm \Delta a$. Strategies are
type-contingent capacities $N_i(\theta_i)$. Bayesian Nash equilibrium:

$$N_i^*(\theta_i) = \arg\max_N \sum_{\theta_j} P(\theta_j)\, \pi_i\big(N, N_j^*(\theta_j); \theta_i, \theta_j\big)\quad \forall i, \theta_i .$$

Solved by best-response iteration over the four type-contingent strategies; compared with complete-information
Cournot for every type profile (value of information = expected complete-information profit − BNE profit).

## 4. Verification of every equilibrium

For a candidate profile $x^*$ and each player $i$, evaluate $\pi_i(x_i', x_{-i}^*)$ on a 401-point grid over the
feasible strategy interval, polish the best grid point with a bounded Brent search, and require

$$\max_{x_i'} \pi_i(x_i', x_{-i}^*) - \pi_i(x^*) \le \max(₹1,\ 10^{-3}|\pi_i(x^*)|).$$

Leaders are checked on 121 alternative commitments with the follower re-optimising. Two-stage SPEs are checked in
both stages, Bayesian equilibria per (player, type), and planner/collusion optima on an independent grid. Textbook
sanity tests use the same solvers: linear Cournot $q^* = (a-c)/3b$, Stackelberg leader $(a-c)/2b$, homogeneous
Bertrand $p \to c$, grim-trigger $\delta^* = 0.5$ for $(T,R,P,S) = (5,3,1,0)$, Matching Pennies $(\tfrac12,\tfrac12)$, and the
Gibbons closed form for Bayesian Cournot.

## 5. Agent-based simulation

Grid city, hotspots, Poisson arrivals with a rise–peak–fall rate (mean Λ, peak 1.35Λ), logit customer choice using
EWMA of realised delays, logit rider choice every 15 minutes, FIFO nearest-idle-rider dispatch, Gamma prep time, travel
at 20 km/h × 1.3 road factor, cancellation after 20 minutes. The analytical benchmark at minute $t$ is the fixed-point
delay at $\Lambda(t)$ with the equilibrium $(w, p)$. Error metrics: MAE, MAPE and bias of per-minute delays (5-minute
smoothing), with 95% confidence intervals over 20 seeds. A curve $d_0 + s\rho/(1-\rho)$ is fitted to the pooled simulated
(ρ, delay) points to compare implied parameters.
