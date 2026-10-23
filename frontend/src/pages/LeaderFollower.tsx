import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BRChart } from "../components/charts";
import GameTree, { type TreeBranch } from "../components/GameTree";
import {
  Busy, ChartCard, ChartTooltip, ErrorBox, Legend, Loading, MetricCard, PageHeader, PlainWords, Segmented, VerificationBadge, useAxis,
} from "../components/ui";
import { ScenarioPicker } from "./Playground";
import { useApi } from "../lib/api";
import { compact, fmt, inr } from "../lib/format";
import { Advanced } from "../lib/detail";
import { useParams } from "../lib/params";
import { useTheme } from "../lib/theme";
import type { ModelResult } from "../lib/types";

type Tab = "stackelberg_capacity" | "stackelberg_incentive" | "two_stage";

interface InsightsPayload { insights: { id: string; data: Record<string, number | string>[] }[] }

function Stepper({ steps, step, setStep }: { steps: string[]; step: number; setStep: (n: number) => void }) {
  return (
    <div className="card card-pad">
      <div className="mb-2 flex items-center justify-between">
        <div className="h-sec">Backward induction, step by step</div>
        <div className="flex items-center gap-1">
          <button className="btn-icon" onClick={() => setStep(Math.max(0, step - 1))} aria-label="Previous step"><ChevronLeft size={16} /></button>
          <span className="num text-xs text-muted">{step} / {steps.length}</span>
          <button className="btn-icon" onClick={() => setStep(Math.min(steps.length, step + 1))} aria-label="Next step"><ChevronRight size={16} /></button>
        </div>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} onClick={() => setStep(i + 1)}
            className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] transition ${i < step ? "bg-accent/10 text-ink" : "text-muted hover:text-ink2"}`}>
            <span className="num mr-2 font-semibold">{i + 1}.</span>{s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function FMAChart() {
  const { params } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const { data } = useApi<InsightsPayload>("/insights", { params });
  const d = data?.insights.find((i) => i.id === "first_mover")?.data;
  if (!d) return <Loading />;
  return (
    <ChartCard title="First-mover advantage across demand levels" height={280} csv={d}
      takeaway="Capacity leadership pays more as demand rises. Incentive leadership also pays, but the follower's gain (strategic complements) is larger."
      footer={<Legend items={[{ label: "Leader commits to capacity", color: c.series[3] }, { label: "Leader commits to incentive", color: c.series[4] }]} />}>
      <ResponsiveContainer>
        <BarChart data={d} margin={{ top: 8, right: 8, bottom: 18, left: 8 }} barGap={2}>
          <CartesianGrid {...ax.grid} />
          <XAxis dataKey="scenario" tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false} />
          <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={compact} width={50}
            label={{ value: "Leader profit gain (INR/h)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
          <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => inr(v)} />} />
          <ReferenceLine y={0} stroke={c.axis} />
          <Bar dataKey="capacity_fma" name="Capacity leadership" fill={c.series[3]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="incentive_fma" name="Incentive leadership" fill={c.series[4]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function StackelbergView({ res }: { res: ModelResult }) {
  const { c } = useTheme();
  const ax = useAxis();
  const [step, setStep] = useState(0);
  const sym = res.strategy_variable.symbol;
  const u = res.strategy_variable.unit === "riders" ? "" : "₹";
  const tree: TreeBranch[] = (res.extras.tree as { leader: number; follower: number; payoff_leader: number; payoff_follower: number; chosen: boolean }[])
    .map((n) => ({ edge: `${sym}_A=${u}${fmt(n.leader, 1)}`, response: `${sym}_B=${u}${fmt(n.follower, 1)}`, payoff: [n.payoff_leader, n.payoff_follower], chosen: n.chosen }));
  const curve = res.extras.leader_curve as { leader: number; follower: number; leader_payoff: number }[];
  const o = res.outcome;
  const sim = res.extras.simultaneous_profit as [number, number];
  const steps = [
    `B observes A's commitment and best-responds: for every ${sym}_A, compute BR_B(${sym}_A).`,
    `Substitute B's reaction into A's profit: A now faces π_A(${sym}_A, BR_B(${sym}_A)), a function of its own choice only.`,
    `A picks the commitment with the highest anticipated profit: ${sym}_A = ${u}${fmt(res.equilibrium.A, 2)}, and B replies ${sym}_B = ${u}${fmt(res.equilibrium.B, 2)}.`,
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Leader A profit" total={inr(o.profit[0])} unit={`vs ${inr(sim[0])} simultaneous`} />
        <MetricCard label="First-mover advantage" total={inr(res.extras.first_mover_advantage)} unit="/h" />
        <MetricCard label="Follower B profit change" total={inr(res.extras.follower_change)} unit="/h" />
        <MetricCard label="Delay" a={fmt(o.delay[0])} b={fmt(o.delay[1])} unit="min" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard title="Game tree (representative commitments)" height="auto"
          takeaway="A moves first; B sees A's choice and responds. The thick path is the subgame-perfect equilibrium."
          csv={tree.map((b) => ({ leader: b.edge, follower: b.response, payoff_A: b.payoff[0], payoff_B: b.payoff[1], chosen: b.chosen }))}>
          <GameTree root="commits first" second="B's best response?" branches={tree} step={step} />
        </ChartCard>
        <Stepper steps={steps} step={step} setStep={setStep} />
      </div>
      <ChartCard title="Leader's anticipated profit and the follower's reaction" height={300} csv={curve}
        takeaway={`A's profit curve already includes B's best response; the peak is A's optimal commitment. Simultaneous play would give A ${inr(sim[0])}.`}
        footer={<Legend items={[{ label: "A's profit given B's reaction", color: c.A }, { label: "A's simultaneous-move profit", color: c.muted, dashed: true }]} />}>
        <ResponsiveContainer>
          <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
            <CartesianGrid {...ax.grid} />
            <XAxis type="number" dataKey="leader" domain={["dataMin", "dataMax"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
              label={{ value: `Leader's commitment ${sym}_A (${res.strategy_variable.unit})`, position: "bottom", offset: 6, ...ax.labelStyle }} />
            <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={52} tickFormatter={compact}
              label={{ value: "INR per hour", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => `${sym}_A = ${fmt(Number(l), 1)}`} valueFormatter={(v) => inr(v)} />} />
            <ReferenceLine y={sim[0]} stroke={c.muted} strokeDasharray="4 4" />
            <ReferenceLine x={res.equilibrium.A} stroke={c.text} strokeDasharray="2 3" />
            <Line dataKey="leader_payoff" name="A's profit" stroke={c.A} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function TwoStageView({ res }: { res: ModelResult }) {
  const { c } = useTheme();
  const ax = useAxis();
  const [step, setStep] = useState(0);
  const tree: TreeBranch[] = (res.extras.tree as { N: number[]; p: number[]; payoff: number[]; chosen: boolean }[])
    .filter((n) => Math.abs(n.N[1] - res.equilibrium.B) < 1e-6)
    .filter((n, i, arr) => arr.findIndex((m) => Math.abs(m.N[0] - n.N[0]) < 1e-6) === i)
    .map((n) => ({ edge: `N=(${fmt(n.N[0], 0)}, ${fmt(n.N[1], 0)})`, response: `p=(₹${fmt(n.p[0], 1)}, ₹${fmt(n.p[1], 1)})`, payoff: [n.payoff[0], n.payoff[1]], chosen: n.chosen }));
  const fee = res.extras.fee_curve as { N_A: number; p_A: number; p_B: number; profit_A: number }[];
  const o = res.outcome;
  const cN = res.extras.cournot_capacity as number[];
  const steps = res.extras.backward_induction as string[];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="SPE capacity N" a={fmt(res.equilibrium.A, 1)} b={fmt(res.equilibrium.B, 1)} unit="riders" />
        <MetricCard label="Cournot capacity N" a={fmt(cN[0], 1)} b={fmt(cN[1], 1)} unit="riders" />
        <MetricCard label="Stage-2 fees" a={inr(o.p[0], 1)} b={inr(o.p[1], 1)} />
        <MetricCard label="Profit" a={inr(o.profit[0])} b={inr(o.profit[1])} unit="/h" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard title="Two-stage game tree: capacities, then the fee subgame" height="auto"
          takeaway="Each capacity pair (only A's deviations from the SPE are shown) leads to a fee subgame whose Nash equilibrium fixes the payoffs."
          csv={tree.map((b) => ({ capacities: b.edge, fees: b.response, payoff_A: b.payoff[0], payoff_B: b.payoff[1], chosen: b.chosen }))}>
          <GameTree root="Stage 1: choose capacity" second="Stage 2 fee equilibrium?" branches={tree} step={step} />
        </ChartCard>
        <Stepper steps={steps} step={step} setStep={setStep} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {res.br_curves && <Advanced><BRChart res={res} height={300} /></Advanced>}
        <ChartCard title="How capacity commitments shape the fee stage" height={300} csv={fee}
          takeaway="A bigger fleet makes A cut its fee to fill capacity, and the rival's fee follows. Committed capacity softens later price competition."
          footer={<Legend items={[{ label: "Stage-2 fee of A", color: c.A }, { label: "Stage-2 fee of B", color: c.B }]} />}>
          <ResponsiveContainer>
            <LineChart data={fee} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
              <CartesianGrid {...ax.grid} />
              <XAxis type="number" dataKey="N_A" domain={["dataMin", "dataMax"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
                tickFormatter={(v) => fmt(v, 0)} label={{ value: "A's capacity N_A (riders), B at SPE", position: "bottom", offset: 6, ...ax.labelStyle }} />
              <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={44}
                label={{ value: "Fee (INR/order)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => `N_A = ${fmt(Number(l), 0)}`} valueFormatter={(v) => inr(v, 1)} />} />
              <ReferenceLine x={res.equilibrium.A} stroke={c.text} strokeDasharray="2 3" />
              <Line dataKey="p_A" name="p_A" stroke={c.A} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="p_B" name="p_B" stroke={c.B} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="card card-pad text-[14px] leading-relaxed text-ink2">
        <div className="h-sec mb-1">Why this matters (Kreps–Scheinkman)</div>
        <p className="mb-1">When platforms must lock in their fleet size before setting fees, they end up hiring almost exactly as many riders
          as in the simple Cournot game ({fmt(res.equilibrium.A, 0)} vs {fmt(cN[0], 0)} riders). Committing to capacity first stops a fee price-war.</p>
        <Advanced>{res.notes.map((n, i) => <p key={i} className="mb-1">{n}</p>)}</Advanced>
      </div>
    </div>
  );
}

export default function LeaderFollower() {
  const { params, scenario } = useParams();
  const [tab, setTab] = useState<Tab>("stackelberg_capacity");
  const { data, loading, error } = useApi<ModelResult>(`/solve/${tab}`, { scenario, params, curves: true });
  return (
    <div>
      <PageHeader kicker="Page 5 · Module 4: who moves first?" title="Leader–Follower Games">
        Here the platforms do not decide at the same time: Platform A decides first, and Platform B sees A's decision and then responds.
      </PageHeader>
      <PlainWords>
        We solve these games <b>backwards</b> (backward induction). First ask: “for each possible move by A, what would B do?”
        Then A, knowing B's reactions, picks the move that is best for itself. The <b>first-mover advantage</b> is how much more A
        earns by moving first than when both decide together.
      </PlainWords>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "stackelberg_capacity", label: "Stackelberg: capacity" },
          { value: "stackelberg_incentive", label: "Stackelberg: incentives" },
          { value: "two_stage", label: "Two-stage: capacity → fees" }]} />
        <ScenarioPicker />
        <Busy on={loading} />
        {data && <VerificationBadge v={data.verification} label="SPE verified" />}
      </div>
      {error && <ErrorBox error={error} />}
      {!data && !error && <Loading tall label={tab === "two_stage" ? "Solving nested fee subgames (~10 s)…" : "Solving…"} />}
      {data && data.model === tab && (tab === "two_stage" ? <TwoStageView res={data} /> : <StackelbergView key={tab} res={data} />)}
      <div className="mt-6"><FMAChart /></div>
    </div>
  );
}
