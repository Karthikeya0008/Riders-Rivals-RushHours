import type { ReactNode } from "react";
import { PageHeader, PlainWords, Section, Tex } from "../components/ui";
import { Advanced } from "../lib/detail";
import { useParams } from "../lib/params";

function Eq({ title, children, tex }: { title: string; children?: ReactNode; tex: string }) {
  return (
    <div className="card card-pad">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <Tex block>{tex}</Tex>
      {children && <div className="text-[13px] leading-relaxed text-ink2">{children}</div>}
    </div>
  );
}

const MODULES = [
  ["1", "Strategic games, Nash equilibrium in continuous strategies", "Cournot (capacity), Bertrand (incentives / fees), homogeneous Bertrand paradox, best-response curves, deviation check", "Playground, Comparison"],
  ["2", "Dominance, iterated elimination (strict & weak)", "IESDS / IEWDS on the Low / Medium / High incentive matrix, step-by-step animation, mixed-strategy domination via LP", "Strategic Form Lab"],
  ["3", "Mixed strategies", "Support enumeration for all NE; Matching Pennies (0.5, 0.5) test", "Strategic Form Lab"],
  ["4", "Extensive form, backward induction, subgame perfection", "Stackelberg (capacity & incentive leadership), two-stage capacity-then-fee game, game trees, first-mover advantage, Kreps–Scheinkman", "Leader–Follower"],
  ["5", "Games of incomplete information", "Bayesian Cournot with private High / Low demand types, type-contingent strategies, value of information", "Incomplete Information"],
  ["6", "Maxmin / security strategies, social dilemmas", "Pure and mixed maxmin (LP), Prisoner's Dilemma detection, price of anarchy vs planner", "Strategic Form Lab, Comparison"],
  ["7", "Repeated games", "Grim-trigger critical δ*, Nash reversion, strategy tournament (ALLD, ALLC, Grim, TFT, GTFT), imperfect observability", "Repeated Game Lab"],
];

export default function Methodology() {
  const { config } = useParams();
  const m = config?.defaults.market ?? {};
  const v = (k: string) => (m[k] !== undefined ? String(m[k]) : "…");
  return (
    <div>
      <PageHeader kicker="Page 10 · equations, assumptions, limitations" title="Methodology">
        Every model below is evaluated by one shared <b>MarketEnvironment</b> (one peak hour in one city zone, INR). Models
        differ only in which variable each platform chooses and the timing of moves.
      </PageHeader>

      <PlainWords>
        This page lists the formulas behind the app. In one sentence each: riders pick the app that pays better; more riders means
        more delivery capacity; a busier fleet means longer delays; customers pick the app with the better fee and delay; and profit
        is orders × (fee + commission − rider pay). The games only change <b>who chooses what, and when</b>.
      </PlainWords>
      <Section title="1. The shared market environment">
        <div className="grid gap-4 lg:grid-cols-2">
          <Eq title="Rider supply (logit over A, B and an outside option)" tex={String.raw`N_i=R\,\frac{e^{\beta w_i}}{e^{\beta w_0}+\sum_j e^{\beta w_j}},\qquad N_0=R-N_A-N_B`}>
            R = {v("R")} multi-homing riders, reservation incentive w₀ = ₹{v("w0")}/order, β = {v("beta")}.
          </Eq>
          <Eq title="Inverse supply (used when a platform chooses capacity)" tex={String.raw`w_i=w_0+\frac{1}{\beta}\ln\frac{N_i}{N_0}`}>
            The same supply curve, so capacity (Cournot) and incentive (Bertrand) games are directly comparable.
          </Eq>
          <Eq title="Capacity and utilisation" tex={String.raw`\mu_i=k\,N_i,\qquad \rho_i=\min\!\left(\frac{\lambda_i}{\mu_i},\,\rho_{\max}\right)`}>
            k = {v("k")} orders per rider-hour, ρ_max = {v("rho_max")}; orders beyond ρ_max·μᵢ are unserved.
          </Eq>
          <Eq title="Queueing-based delay" tex={String.raw`D_i=d_0+s\,\frac{\rho_i}{1-\rho_i}`}>d₀ = {v("d0")} min, s = {v("s")} min.</Eq>
          <Eq title="Customer demand (logit with outside option)" tex={String.raw`\lambda_i=\Lambda\,\frac{e^{u_i}}{1+\sum_j e^{u_j}},\qquad u_i=a_i-b\,p_i-c\,D_i`}>
            a = {v("a_B")}, b = {v("b")}, c = {v("c")}. Demand depends on delay and delay on demand, so (λ, D) is solved as a fixed point.
          </Eq>
          <Advanced><Eq title="Demand–delay fixed point" tex={String.raw`F(D)=D-g\big(\rho(D)\big)=0,\quad D^{(n+1)}=D^{(n)}-t\,J^{-1}F\big(D^{(n)}\big)`}>
            Damped Newton iteration with backtracking (step t), bounded to [d₀, D_max]; fallback: coordinate bisection. Verified against plain
            damped iteration <Tex>{String.raw`D\leftarrow(1-\alpha)D+\alpha g(D)`}</Tex>; residual &lt; 10⁻⁹ in every equilibrium.
          </Eq></Advanced>
          <Eq title="Platform profit" tex={String.raw`\pi_i=\text{completed}_i\,(p_i+m-w_i)-F_i,\qquad \text{completed}_i=\min(\lambda_i,\rho_{\max}\mu_i)`}>
            m = ₹{v("m")} restaurant commission per order, fixed fee p = ₹{v("p")} when fees are not strategic.
          </Eq>
          <Eq title="Welfare" tex={String.raw`\begin{aligned}CS&=\tfrac{\Lambda-U}{b}\ln\!\Big(1+\sum_j e^{u_j}\Big)-\big(h-\tfrac{c}{b}\big)\sum_i \text{completed}_i\,(D_i-d_0)\\ RS&=\kappa\,\tfrac{R}{\beta}\ln\!\Big(1+\sum_j e^{\beta(w_j-w_0)}\Big),\ \ \kappa=\tfrac{\sum\text{completed}}{N_A+N_B}\\ W&=CS+\pi_A+\pi_B+RS\end{aligned}`}>
            Delay is valued at h = ₹{v("delay_cost")}/min. The log-sum already charges customers' own c/b = ₹{(Number(m.c) / Number(m.b)).toFixed(1)}/min, so only the unperceived remainder is subtracted.
          </Eq>
          <Eq title="Efficiency and price of anarchy" tex={String.raw`\text{Eff}=\frac{W^{\text{model}}}{W^{*}},\qquad \text{PoA}=\frac{W^{*}}{W^{\text{model}}}`}>
            W* is the social planner's maximum over incentives <i>and</i> fees for both platforms, an upper bound for every model.
          </Eq>
        </div>
      </Section>

      <Section title="2. Game models and how equilibria are computed">
        <div className="grid gap-4 lg:grid-cols-2">
          <Eq title="Cournot (capacity)" tex={String.raw`N_i^*=\arg\max_{N_i}\ \pi_i\big(N_i,N_j^*\big),\quad w_i=w_0+\tfrac1\beta\ln\tfrac{N_i}{N_0}`}>Fees fixed. NE by Gauss–Seidel best-response iteration (damped if it cycles).</Eq>
          <Eq title="Bertrand (incentives) and the homogeneous case" tex={String.raw`w_i^*=\arg\max_{w_i}\ \pi_i\big(w_i,w_j^*\big),\qquad \beta\to\infty:\ w^*\to p+m`}>With near-homogeneous riders the incentive is bid up to the full margin and profits vanish: the Bertrand paradox on the input side.</Eq>
          <Eq title="Bertrand (fees)" tex={String.raw`p_i^*=\arg\max_{p_i}\ \pi_i\big(p_i,p_j^*;\bar N\big)`}>Capacity fixed by paying w = w₀.</Eq>
          <Eq title="Stackelberg" tex={String.raw`x_L^*=\arg\max_{x_L}\ \pi_L\big(x_L,\,BR_F(x_L)\big),\qquad \text{FMA}=\pi_L^{\text{Stack}}-\pi_L^{\text{Nash}}`}>Backward induction: global numerical maximisation over the leader's choice with the follower's best response solved inside.</Eq>
          <Eq title="Two-stage: capacity, then fees (SPE)" tex={String.raw`p^*(N)=\text{NE of }\{\pi_i(p;N)\},\qquad N_i^*=\arg\max_{N_i}\pi_i\big(N,p^*(N)\big)`}>The fee subgame is re-solved (warm-started, memoised) for every capacity pair visited.</Eq>
          <Eq title="Planner and collusion benchmarks" tex={String.raw`\max_{w,p}\ W(w,p)\qquad\text{vs.}\qquad \max_{w_A,w_B}\ \pi_A+\pi_B`}>Multi-start Powell from the best points of a coarse grid, verified on an independent grid.</Eq>
          <Advanced><Eq title="Mixed equilibrium (support enumeration)" tex={String.raw`\sum_{j\in J}A_{ij}q_j=v\ \ \forall i\in I,\quad \sum_j q_j=1,\quad q\ge 0,\quad A_{i\cdot}q\le v\ \ \forall i`}>Plus pure NE; maxmin by linear programming; IESDS checks domination by pure and mixed strategies (LP).</Eq></Advanced>
          <Eq title="Repeated game: grim trigger" tex={String.raw`\frac{\pi_C}{1-\delta}\ \ge\ \pi_D+\frac{\delta\,\pi_N}{1-\delta}\iff \delta\ \ge\ \delta^*=\frac{\pi_D-\pi_C}{\pi_D-\pi_N}`}>π_C collusive, π_D best one-shot deviation, π_N punishment (2×2 mutual defection, or the one-shot Bertrand NE for Nash reversion).</Eq>
          <Eq title="Bayesian Cournot" tex={String.raw`N_i^*(\theta_i)=\arg\max_N\ \sum_{\theta_j}P(\theta_j)\,\pi_i\big(N,N_j^*(\theta_j);\theta_i,\theta_j\big)`}>Types shift own attractiveness a ± Δa; four type-contingent strategies solved by best-response iteration.</Eq>
          <Advanced><Eq title="Equilibrium verification (every model, every scenario)" tex={String.raw`\max_{x_i'\in\mathcal G}\ \pi_i(x_i',x_{-i}^*)-\pi_i(x^*)\ \le\ \max\!\big(1,\ 10^{-3}|\pi_i(x^*)|\big)`}>𝒢 is a 401-point grid over the strategy space plus local Brent polishing. Leaders, SPE stages, Bayesian types and benchmarks have analogous checks.</Eq></Advanced>
        </div>
      </Section>

      <Section title="3. Agent-based simulation">
        <div className="card card-pad text-[14px] leading-relaxed text-ink2">
          <p>20 × 20 km grid; 40 restaurants in 5 hotspots; customers within 5 km of the chosen restaurant; road distance = 1.3 × Euclidean at 20 km/h.
            3-hour peak with a rise–peak–fall Poisson arrival rate (mean Λ, peak 1.35 Λ). Riders re-choose A / B / offline by the same logit every 15 minutes;
            orders go to the nearest idle rider of the chosen platform; Gamma prep time (mean 12 min); 2-min handover; cancellation after 20 minutes unassigned.
            Customers choose by the same demand logit using an exponentially-weighted average of recently realised delays. Monte Carlo over 20 seeds gives 95% CIs.
            The analytical benchmark re-solves the demand–delay fixed point at each minute's arrival rate.</p>
        </div>
      </Section>

      <Section title="4. Key assumptions and limitations">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card card-pad">
            <div className="h-sec mb-2">Assumptions</div>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink2">
              <li>One representative zone and one peak hour; platforms are symmetric unless the dominant-platform toggle is on.</li>
              <li>Base attractiveness a = 4.0 (not 1.0): with a = 1 the outside option takes ~92% of demand and peaks never congest (see ASSUMPTIONS.md).</li>
              <li>Riders respond to the per-order incentive only; they are paid per completed order, so idle riders cost platforms nothing.</li>
              <li>Fees are fixed at p = ₹35 except in the fee games; restaurants are outside welfare (commission m is platform revenue).</li>
              <li>Delay costs society ₹3/min above the d₀ service standard; customers already perceive c/b of it.</li>
              <li>Rider surplus converts the per-order log-sum to INR/h with realised orders per active rider.</li>
            </ul>
          </div>
          <div className="card card-pad">
            <div className="h-sec mb-2">Limitations</div>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink2">
              <li>Static one-hour equilibrium; no learning, no rider fatigue, no surge-pricing dynamics within the hour.</li>
              <li>The analytical delay function is single-queue-like; the simulation shows a flatter-then-steeper (many-server) curve, so moderate-load delays are overstated.</li>
              <li>Profits can be non-concave in own strategy, which is why best responses use a global grid search; uniqueness of equilibria is not proven.</li>
              <li>Repeated game uses a 2-action stage game; richer punishments (e.g. stick-and-carrot) are not modelled.</li>
              <li>Parameters are illustrative and calibrated for plausibility, not estimated from Swiggy / Zomato data.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="5. Mapping to the syllabus">
        <div className="card card-pad overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead><tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">Module</th><th className="pr-3 font-medium">Concept</th><th className="pr-3 font-medium">Where it appears in this project</th><th className="font-medium">Page</th></tr></thead>
            <tbody>{MODULES.map(([mod, concept, where, page]) => (
              <tr key={mod} className="border-b border-line/60 align-top">
                <td className="py-2 pr-3 font-semibold text-ink">{mod}</td><td className="pr-3 text-ink">{concept}</td>
                <td className="pr-3 text-ink2">{where}</td><td className="text-ink2">{page}</td></tr>))}</tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
