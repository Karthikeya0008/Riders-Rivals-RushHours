import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BRChart, SplitBars, WelfareBars } from "../components/charts";
import ParamPanel from "../components/ParamPanel";
import {
  Busy, ChartCard, ChartTooltip, ErrorBox, Loading, MetricCard, Note, PageHeader, PlainWords, Segmented, Select, Toggle,
  VerificationBadge, useAxis,
} from "../components/ui";
import { useApi } from "../lib/api";
import { Advanced, BasicOnly } from "../lib/detail";
import { fmt, inr, pct } from "../lib/format";
import { useParams } from "../lib/params";
import { useTheme } from "../lib/theme";
import type { ModelResult } from "../lib/types";
import { useState } from "react";

const MODELS = [
  { value: "cournot", label: "Cournot: capacity N" },
  { value: "bertrand_incentive", label: "Bertrand: incentives w" },
  { value: "bertrand_fee", label: "Bertrand: fees p" },
  { value: "stackelberg_capacity", label: "Stackelberg: capacity" },
  { value: "stackelberg_incentive", label: "Stackelberg: incentives" },
  { value: "two_stage", label: "Two-stage: capacity → fees" },
  { value: "collusion", label: "Collusion (joint profit)" },
  { value: "planner", label: "Social planner" },
];

/* One-paragraph, jargon-free description of each model. */
const PLAIN: Record<string, string> = {
  cournot: "Each platform decides how many riders to hire. To attract more riders it must pay more per order, so hiring is costly. Both decide at the same time, each guessing the other's choice.",
  bertrand_incentive: "Each platform decides how much to pay riders per order. Riders go to whoever pays more, so each platform is tempted to pay a little more than the rival. This is the 'incentive war'.",
  bertrand_homogeneous: "Same as the incentive game, but riders treat the two apps as identical and always go to the higher payer. This pushes rider pay up until platforms make almost no profit.",
  bertrand_fee: "The number of riders is fixed. Each platform only decides the delivery fee it charges customers. Lower fees bring more orders but also more waiting.",
  stackelberg_capacity: "Platform A moves first and announces how many riders it hires. Platform B sees this and then picks its own number. A can use its head start to grab more riders.",
  stackelberg_incentive: "Platform A moves first and announces its rider pay. Platform B sees it and responds. Here B often ends up better off, because it can react to A.",
  two_stage: "First both platforms decide how many riders to hire. Then, knowing those fleet sizes, they set delivery fees. We solve it backwards: first the fee decision, then the hiring decision.",
  collusion: "The two platforms secretly agree to keep rider pay low and maximise their combined profit. It is not stable on its own, because each one is tempted to cheat.",
  planner: "An imaginary neutral planner controls both apps and chooses pay and fees to make everyone (customers, platforms and riders) as well off as possible. It is the best-case benchmark.",
};

export function ScenarioPicker() {
  const { scenario, setScenario, config } = useParams();
  const opts = Object.entries(config?.scenarios ?? { Low: 600, Medium: 1000, Peak: 1500, Extreme: 2000 })
    .map(([k, v]) => ({ value: k, label: <span>{k} <span className="text-[10px] text-muted">{v}</span></span> }));
  return <Segmented value={scenario} options={opts} onChange={setScenario} />;
}

function LeaderCurve({ res }: { res: ModelResult }) {
  const { c } = useTheme();
  const ax = useAxis();
  const data = res.extras.leader_curve as { leader: number; follower: number; leader_payoff: number }[];
  const sym = res.strategy_variable.symbol;
  return (
    <ChartCard title="Leader's profit given the follower's reaction" height={300} csv={data}
      takeaway={`A commits to ${sym}_A = ${fmt(res.equilibrium.A, 1)} at the peak of this curve; B's best response is built into every point.`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
          <CartesianGrid {...ax.grid} />
          <XAxis type="number" dataKey="leader" domain={["dataMin", "dataMax"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
            label={{ value: `Leader's commitment ${sym}_A (${res.strategy_variable.unit})`, position: "bottom", offset: 6, ...ax.labelStyle }} />
          <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={56} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            label={{ value: "A's profit (INR/h)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => `${sym}_A = ${fmt(Number(l), 1)}`} valueFormatter={(v) => inr(v)} />} />
          <Line dataKey="leader_payoff" name="A's profit" stroke={c.A} strokeWidth={2} dot={false} isAnimationActive={false} />
          <ReferenceDot x={res.equilibrium.A} y={res.outcome.profit[0]} r={6} fill={c.text} stroke={c.surface} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export default function Playground() {
  const { params, scenario } = useParams();
  const [model, setModel] = useState("bertrand_incentive");
  const [homog, setHomog] = useState(false);
  const id = model === "bertrand_incentive" && homog ? "bertrand_homogeneous" : model;
  const { data, loading, error } = useApi<ModelResult>(`/solve/${id}`, { scenario, params, curves: true });
  const o = data?.outcome;
  const unit = data?.strategy_variable.unit ?? "";


  return (
    <div>
      <PageHeader kicker="Page 2 · try the models yourself" title="Model Playground">
        Choose how the two platforms compete and how busy the city is. The app finds the outcome where neither platform
        wants to change its decision (the Nash equilibrium) and shows delays, orders and profits.
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select value={model} onChange={setModel} options={MODELS} label="Model" />
        <ScenarioPicker />
        {model === "bertrand_incentive" && <Toggle checked={homog} onChange={setHomog} label="Riders see both apps as identical (Bertrand paradox)" />}
        <Busy on={loading} />
      </div>

      <PlainWords title={`What is “${MODELS.find((m) => m.value === model)?.label}”?`}>{PLAIN[id]}</PlainWords>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start"><ParamPanel /></div>
        <div className="min-w-0 space-y-5">
          {error && <ErrorBox error={error} />}
          {!data && !error && <Loading tall />}
          {data && o && (
            <>
              <div className="card card-pad flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">{data.label} · {data.scenario} demand ({fmt(data.demand_rate, 0)} orders/h)</div>
                  <div className="mt-1 text-lg font-semibold text-ink">
                    {data.info?.timing === "benchmark" ? "Best choice" : "Equilibrium"}: A chooses <span className="num text-pa">{unit === "riders" ? "" : "₹"}{fmt(data.equilibrium.A, 1)}</span>,
                    B chooses <span className="num text-pb">{unit === "riders" ? "" : "₹"}{fmt(data.equilibrium.B, 1)}</span>
                    <span className="ml-1 text-sm font-normal text-muted">({unit === "riders" ? "riders hired" : data.strategy_variable.symbol === "w" ? "rider pay per order" : "delivery fee per order"})</span>
                  </div>
                  <Advanced>
                    <div className="mt-0.5 text-xs text-muted">
                      {data.convergence.iterations !== undefined && data.info?.timing === "simultaneous" &&
                        `Best-response iteration converged in ${data.convergence.iterations} rounds. `}
                      Demand–delay fixed point: {o.fixed_point.method}, residual {o.fixed_point.residual.toExponential(1)}.
                    </div>
                  </Advanced>
                </div>
                <VerificationBadge v={data.verification} label={data.info?.timing === "benchmark" ? "Optimum verified" : "Equilibrium verified"} />
              </div>

              {id === "bertrand_homogeneous" && (
                <Note>
                  <b className="text-ink">Bertrand paradox.</b> If riders see the two apps as identical, whoever pays even ₹1 more gets almost
                  every rider. So the platforms keep outbidding each other until rider pay reaches the full amount they earn per order
                  (₹{fmt(data.extras.margin_per_order, 0)}), and profit drops to almost nothing ({inr(o.total_profit)}/h). Just two competitors are enough to kill all profit.
                </Note>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Average delivery time" a={fmt(o.delay[0])} b={fmt(o.delay[1])} unit="min" />
                <MetricCard label="Orders delivered" a={fmt(o.completed[0], 0)} b={fmt(o.completed[1], 0)} unit="/h" />
                <MetricCard label="Profit" a={inr(o.profit[0])} b={inr(o.profit[1])} unit="/h" />
                <MetricCard label="Paid to riders" a={inr(o.incentive_spend[0])} b={inr(o.incentive_spend[1])} unit="/h" />
              </div>
              <Advanced>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricCard label="Riders online" a={fmt(o.N[0], 0)} b={fmt(o.N[1], 0)} />
                  <MetricCard label="Incentive / fee" a={`₹${fmt(o.w[0], 1)} / ₹${fmt(o.p[0], 1)}`} b={`₹${fmt(o.w[1], 1)} / ₹${fmt(o.p[1], 1)}`} />
                  <MetricCard label="Utilisation ρ" a={fmt(o.rho[0], 2)} b={fmt(o.rho[1], 2)} />
                  <MetricCard label="Unserved orders" a={fmt(o.unserved[0], 1)} b={fmt(o.unserved[1], 1)} unit="/h" />
                  <MetricCard label="Consumer surplus" total={inr(o.consumer_surplus)} unit="/h" />
                  <MetricCard label="Rider surplus" total={inr(o.rider_surplus)} unit="/h" />
                  <MetricCard label="Total welfare" total={inr(o.total_welfare)} unit="/h" />
                  <MetricCard label="Efficiency (W / W*)" total={o.efficiency === null ? "n/a" : pct(o.efficiency)}
                    unit={o.price_of_anarchy ? `PoA ${fmt(o.price_of_anarchy, 3)}` : ""} hint="Welfare relative to the social planner; PoA = W*/W" />
                </div>
              </Advanced>
              <BasicOnly>
                {o.efficiency !== null && (
                  <Note>
                    <b className="text-ink">How good is this for society?</b> {pct(o.efficiency, 0)} of the best possible outcome
                    (what an ideal planner controlling both apps would achieve). Higher is better.
                  </Note>
                )}
              </BasicOnly>

              {data.br_curves && <BRChart res={data} />}
              {data.extras.leader_curve && <LeaderCurve res={data} />}
              {!data.br_curves && !data.extras.leader_curve && (
                <Note>This is a benchmark, not a contest between the two platforms, so there are no best-response lines to show.</Note>
              )}
              <div className="grid gap-5 xl:grid-cols-2">
                <WelfareBars o={o} />
                <SplitBars o={o} />
              </div>
              <Advanced>
                {data.notes.length > 0 && (
                  <div className="card card-pad">
                    <div className="h-sec mb-2">Model notes</div>
                    <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink2">
                      {data.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}
              </Advanced>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
