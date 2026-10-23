import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Busy, ChartCard, ChartTooltip, ErrorBox, Legend, Loading, Note, PageHeader, PlainWords, Slider, Tex, VerificationBadge, useAxis,
} from "../components/ui";
import { ScenarioPicker } from "./Playground";
import { post, useApi } from "../lib/api";
import { fmt, inr, pct } from "../lib/format";
import { Advanced, useDetail } from "../lib/detail";
import { useParams } from "../lib/params";
import { useTheme } from "../lib/theme";
import type { Verification } from "../lib/types";

interface Profile {
  types: [string, string]; probability: number; N: number[]; w: number[]; delay: number[]; profit: number[];
  completed: number[]; complete_info_N: number[]; complete_info_profit: number[];
}
interface Bayes {
  prior_high: number; a_shift: number; attractiveness: Record<string, number>;
  strategies: { A: { H: number; L: number }; B: { H: number; L: number } };
  converged: boolean; iterations: number; verification: Verification; profiles: Profile[];
  expected: { profit: number[]; delay: number[]; completed: number[]; welfare: number; complete_info_profit: number[]; value_of_information: number[] };
  notes: string[];
}

const PRIORS = [0, 0.2, 0.4, 0.6, 0.8, 1];

export default function IncompleteInfo() {
  const { params, scenario, config } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const [q, setQ] = useState(0.5);
  const [shift, setShift] = useState(0.3);
  useEffect(() => {
    if (config) { setQ(config.defaults.bayesian.prior_high); setShift(config.defaults.bayesian.a_shift); }
  }, [config]);
  const { data, loading, error } = useApi<Bayes>("/bayesian", { scenario, params, prior_high: q, a_shift: shift }, 350);
  const { detail } = useDetail();
  const [sweep, setSweep] = useState<{ q: number; AH: number; AL: number }[] | null>(null);
  useEffect(() => {
    setSweep(null);
    if (!detail) return;
    let alive = true;
    Promise.all(PRIORS.map((p) => post<Bayes>("/bayesian", { scenario, params, prior_high: p, a_shift: shift })))
      .then((rs) => alive && setSweep(rs.map((r, i) => ({ q: PRIORS[i], AH: r.strategies.A.H, AL: r.strategies.A.L }))))
      .catch(() => alive && setSweep([]));
    return () => { alive = false; };
  }, [scenario, params, shift, detail]);

  if (error) return <div><PageHeader title="Incomplete Information" /><ErrorBox error={error} /></div>;
  const bars = data?.profiles.map((p) => ({
    profile: `A=${p.types[0]}, B=${p.types[1]}`, bne_A: p.N[0], ci_A: p.complete_info_N[0], bne_B: p.N[1], ci_B: p.complete_info_N[1],
  }));

  return (
    <div>
      <PageHeader kicker="Page 7 · Module 5: Bayesian games" title="Incomplete Information">
        Each platform knows whether its <b>own</b> demand today is High or Low, but not the rival's. How many riders should it hire?
      </PageHeader>
      <PlainWords>
        Each platform makes a plan: “if my demand is High, hire this many; if Low, hire that many”. Because it cannot see the rival's
        demand, it plans against the rival's <b>average</b> behaviour, using the probability that the rival is busy (the prior).
        A plan where neither platform wants to change is a <b>Bayesian Nash equilibrium</b>. Compare it with “complete information”,
        where both could see each other's demand.
      </PlainWords>
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card card-pad space-y-4">
            <ScenarioPicker />
            <Slider label="Chance a platform's demand is High (prior)" value={q} min={0} max={1} step={0.05} onChange={setQ} />
            <Slider label="How big the High/Low difference is (Δa)" value={shift} min={0} max={1} step={0.05} onChange={setShift} />
            <Busy on={loading} />
          </div>
          <Advanced><div className="card card-pad text-[13px] leading-relaxed text-ink2">
            <div className="label mb-1">Bayesian Nash equilibrium</div>
            Each type maximises <i>expected</i> profit given the rival's type-contingent strategy:
            <Tex block>{String.raw`N_i^*(\theta_i)=\arg\max_{N}\sum_{\theta_j} P(\theta_j)\,\pi_i\big(N,\,N_j^*(\theta_j);\theta_i,\theta_j\big)`}</Tex>
          </div></Advanced>
        </div>
        <div className="min-w-0 space-y-5">
          {!data ? <Loading tall /> : (
            <>
              <div className="card card-pad flex flex-wrap items-center justify-between gap-4">
                <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                  {(["A", "B"] as const).flatMap((pl) => (["H", "L"] as const).map((t) => (
                    <div key={pl + t}>
                      <div className="label flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: pl === "A" ? c.A : c.B }} />{pl}, {t === "H" ? "High" : "Low"} type</div>
                      <div className="num mt-1 text-xl font-semibold text-ink">{fmt(data.strategies[pl][t], 1)} <span className="text-xs font-normal text-muted">riders</span></div>
                    </div>
                  )))}
                </div>
                <VerificationBadge v={data.verification} label="BNE verified (per type)" />
              </div>

              <ChartCard title="Type-contingent capacity: Bayesian vs complete information" height={300} csv={bars}
                takeaway="Under private information each type best-responds to the rival's average capacity, so capacities move towards each other. A High type facing a Low rival hires fewer riders than it would if it could see the rival's type."
                footer={<Legend items={[{ label: "A, Bayesian NE", color: c.A }, { label: "A, complete info", color: c.series[2] }, { label: "B, Bayesian NE", color: c.B }, { label: "B, complete info", color: c.series[3] }]} />}>
                <ResponsiveContainer>
                  <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 18, left: 8 }} barGap={2}>
                    <CartesianGrid {...ax.grid} />
                    <XAxis dataKey="profile" tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false} />
                    <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={44} domain={[(min: number) => Math.floor(min * 0.9), "auto"]}
                      label={{ value: "Riders hired", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => fmt(v, 1)} />} />
                    <Bar dataKey="bne_A" name="A (BNE)" fill={c.A} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="ci_A" name="A (complete info)" fill={c.series[2]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="bne_B" name="B (BNE)" fill={c.B} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="ci_B" name="B (complete info)" fill={c.series[3]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <Advanced>
              <div className="grid gap-5 xl:grid-cols-2">
                <ChartCard title="Platform A's strategy as beliefs change" height={280} csv={sweep ?? undefined}
                  takeaway="The more likely a High-demand rival, the fewer riders each type hires: it expects a more aggressive competitor for the shared pool."
                  footer={<Legend items={[{ label: "A when its demand is High", color: c.A }, { label: "A when its demand is Low", color: c.series[2] }]} />}>
                  {!sweep ? <Loading label="Solving 6 priors…" /> : (
                    <ResponsiveContainer>
                      <LineChart data={sweep} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
                        <CartesianGrid {...ax.grid} />
                        <XAxis dataKey="q" type="number" domain={[0, 1]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={(v) => pct(v, 0)}
                          label={{ value: "Prior P(High)", position: "bottom", offset: 6, ...ax.labelStyle }} />
                        <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={44} domain={["auto", "auto"]}
                          label={{ value: "Riders hired", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
                        <Tooltip content={<ChartTooltip labelFormatter={(l) => `P(High) = ${pct(Number(l), 0)}`} valueFormatter={(v) => fmt(v, 1)} />} />
                        <ReferenceLine x={q} stroke={c.text} strokeDasharray="3 3" />
                        <Line dataKey="AH" name="High type" stroke={c.A} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.A }} isAnimationActive={false} />
                        <Line dataKey="AL" name="Low type" stroke={c.series[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.series[2] }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <ChartCard title="Outcomes by realised type profile" height="auto" csv={data.profiles.map((p) => ({ types: p.types.join("/"), probability: p.probability, N_A: p.N[0], N_B: p.N[1], delay_A: p.delay[0], delay_B: p.delay[1], profit_A: p.profit[0], profit_B: p.profit[1], ci_profit_A: p.complete_info_profit[0] }))}
                  takeaway={`Expected profit of A: ${inr(data.expected.profit[0])} vs ${inr(data.expected.complete_info_profit[0])} with complete information (value of information ${inr(data.expected.value_of_information[0])}/h).`}>
                  <table className="w-full text-[13px]">
                    <thead><tr className="border-b border-line text-left text-xs text-muted">
                      <th className="py-1.5 font-medium">Types (A, B)</th><th className="text-right font-medium">Prob.</th>
                      <th className="text-right font-medium">Delay A / B</th><th className="text-right font-medium">Profit A / B</th></tr></thead>
                    <tbody>{data.profiles.map((p) => (
                      <tr key={p.types.join()} className="border-b border-line/60">
                        <td className="py-1.5 text-ink">{p.types[0]}, {p.types[1]}</td>
                        <td className="num text-right text-ink2">{pct(p.probability, 0)}</td>
                        <td className="num text-right text-ink">{fmt(p.delay[0])} / {fmt(p.delay[1])}</td>
                        <td className="num text-right text-ink">{inr(p.profit[0])} / {inr(p.profit[1])}</td>
                      </tr>))}</tbody>
                  </table>
                </ChartCard>
              </div>
              </Advanced>
              <Note>{data.notes.map((n, i) => <p key={i} className="mb-1 last:mb-0">{n}</p>)}
                <p className="mt-1">Types shift attractiveness: High a = {fmt(data.attractiveness.A_H, 2)}, Low a = {fmt(data.attractiveness.A_L, 2)}.
                  Best-response iteration over the four type-contingent strategies converged in {data.iterations} rounds.</p></Note>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
