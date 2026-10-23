import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Busy, ChartCard, ChartTooltip, ErrorBox, Legend, Loading, Note, PageHeader, PlainWords, Select, Slider, Stat, Tex, useAxis,
} from "../components/ui";
import { ScenarioPicker } from "./Playground";
import { useApi } from "../lib/api";
import { compact, fmt, inr, pct } from "../lib/format";
import { Advanced, useDetail } from "../lib/detail";
import { useParams } from "../lib/params";
import { seqColor, useTheme } from "../lib/theme";

interface Match { row: string; col: string; avg_discounted: number[]; cumulative: number[][]; cooperation_rate: number; cooperation_path: number[] }
interface Repeated {
  delta: number; noise: number; T: number; generosity: number;
  levels: { cooperate: number; defect: number; nash: number };
  stage_game: { labels: string[]; payoff_row: number[][]; payoff_col: number[][]; T: number; R: number; P: number; S: number; classification: { label: string; is_pd: boolean } };
  pi_nash_continuous: number;
  delta_star: number | null;
  delta_star_nash_reversion: number | null;
  cooperation_sustainable: boolean;
  value_curve: { delta: number; cooperate: number; deviate: number; deviate_nash_reversion: number }[];
  tournament: { strategies: string[]; names: string[]; payoff_matrix: number[][]; cooperation_matrix: number[][]; ranking: { strategy: string; name: string; score: number }[]; matches: Match[] };
  noise_sweep: Record<string, number>[];
  notes: string[];
}

const STRAT_SLOT: Record<string, number> = { ALLC: 2, ALLD: 3, GRIM: 4, TFT: 5, GTFT: 6 };

export default function RepeatedLab() {
  const { params, scenario, config } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const { detail } = useDetail();
  const d0 = config?.defaults.repeated;
  const [delta, setDelta] = useState(0.9);
  const [noise, setNoise] = useState(0);
  const [T, setT] = useState(60);
  const [gen, setGen] = useState(0.3);
  useEffect(() => {
    if (d0) { setDelta(d0.delta); setNoise(d0.noise); setT(d0.T); setGen(d0.generosity); }
  }, [d0]);
  const { data, loading, error } = useApi<Repeated>("/repeated", { scenario, params, delta, noise, T, generosity: gen }, 350);
  const [matchKey, setMatchKey] = useState("GRIM|TFT");
  const match = useMemo(() => {
    if (!data) return null;
    const [a, b] = matchKey.split("|");
    return data.tournament.matches.find((m) => (m.row === a && m.col === b)) ?? data.tournament.matches[0];
  }, [data, matchKey]);

  if (error) return <div><PageHeader title="Repeated Game Lab" /><ErrorBox error={error} /></div>;
  const ds = data?.delta_star ?? null;
  const name = (s: string) => data?.tournament.names[data.tournament.strategies.indexOf(s)] ?? s;

  return (
    <div>
      <PageHeader kicker="Page 6 · Module 7: repeated games" title="Repeated Game Lab">
        The platforms play the rider-pay game again every day. Can they keep a “let's both pay low” truce going?
      </PageHeader>
      <PlainWords>
        <b>Cooperate</b> = keep rider pay low as agreed. <b>Defect</b> = secretly raise pay to steal riders today.
        Cheating pays once, but the rival then punishes you by paying high forever (<b>grim trigger</b>). Whether cheating is worth it
        depends on how much platforms care about the future. That is the <b>discount factor δ</b> (0 = only today matters,
        close to 1 = the future matters a lot). If δ is above the red line <b>δ*</b>, the truce survives.
      </PlainWords>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card card-pad space-y-4">
            <ScenarioPicker />
            <Slider label={<>Discount factor δ <span className="text-muted">(per day)</span></>} value={delta} min={0} max={0.99} step={0.01}
              onChange={setDelta} marker={ds !== null ? { value: ds, label: `δ* = ${fmt(ds, 3)}` } : undefined} />
            {ds !== null && <div className="-mt-2 text-xs text-muted"><span className="mr-1 inline-block h-2 w-0.5 bg-[#d03b3b]" />δ* = {fmt(ds, 3)} (grim trigger)</div>}
            <Slider label="Chance a fair move is mistaken for cheating (noise)" value={noise} min={0} max={0.3} step={0.01} onChange={setNoise} />
            <Advanced>
              <Slider label="Days T" value={T} min={10} max={200} step={5} onChange={setT} digits={0} />
              <Slider label="GTFT generosity g" value={gen} min={0} max={1} step={0.05} onChange={setGen} />
            </Advanced>
            <Busy on={loading} />
          </div>
          {data && (
            <div className="card card-pad text-[13px] leading-relaxed text-ink2">
              <div className="label mb-1">Stage game (₹/peak hour)</div>
              <div>Cooperate: w = ₹{fmt(data.levels.cooperate, 1)}; Defect: w = ₹{fmt(data.levels.defect, 1)}</div>
              <div className="num mt-1">T = {inr(data.stage_game.T)}, R = {inr(data.stage_game.R)}</div>
              <div className="num">P = {inr(data.stage_game.P)}, S = {inr(data.stage_game.S)}</div>
              <div className="mt-1 font-semibold text-ink">{data.stage_game.classification.label}</div>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {!data ? <Loading tall label="Running the tournament…" /> : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={<>Critical <span className="normal-case">δ*</span> (grim trigger)</>} value={ds === null ? "–" : fmt(ds, 3)} sub={<Tex>{String.raw`\delta^*=\frac{\pi_{dev}-\pi_{coop}}{\pi_{dev}-\pi_{Nash}}`}</Tex>} />
                {detail ? <Stat label={<><span className="normal-case">δ*</span> with Nash reversion</>} value={data.delta_star_nash_reversion === null ? "–" : fmt(data.delta_star_nash_reversion, 3)} sub={`punish with one-shot NE (${inr(data.pi_nash_continuous)})`} />
                  : <Stat label="Cheating gains once" value={inr(data.stage_game.T - data.stage_game.R)} sub="extra profit on the day you cheat" />}
                <Stat label={<>At your <span className="normal-case">δ</span></>} value={<span className={data.cooperation_sustainable ? "text-[#0ca30c]" : "text-[#d03b3b]"}>{data.cooperation_sustainable ? "✓ Sustainable" : "✗ Unravels"}</span>}
                  sub={`δ = ${fmt(delta, 2)} ${data.cooperation_sustainable ? "≥" : "<"} δ*`} />
                <Stat label="Tournament winner" value={data.tournament.ranking[0].strategy} sub={data.tournament.ranking[0].name} />
              </div>

              <ChartCard title="Cooperate forever vs deviate once (average payoff per day)" height={300} csv={data.value_curve}
                takeaway={ds !== null ? `Cooperating pays more than deviating once δ exceeds δ* = ${fmt(ds, 3)}. Platforms must value tomorrow at least ${pct(ds, 0)} as much as today.` : ""}
                footer={<Legend items={[{ label: "Cooperate forever: R", color: c.series[2] }, { label: "Deviate, then grim punishment", color: c.series[3] },
                  { label: "Deviate, then Nash reversion", color: c.series[3], dashed: true }, { label: "your δ", color: c.text, dashed: true }]} />}>
                <ResponsiveContainer>
                  <LineChart data={data.value_curve} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
                    <CartesianGrid {...ax.grid} />
                    <XAxis type="number" dataKey="delta" domain={[0, 1]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
                      label={{ value: "Discount factor δ", position: "bottom", offset: 6, ...ax.labelStyle }} />
                    <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={52} tickFormatter={compact} domain={["auto", "auto"]}
                      label={{ value: "Avg profit (INR/h)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => `δ = ${fmt(Number(l), 2)}`} valueFormatter={(v) => inr(v)} />} />
                    {ds !== null && <ReferenceLine x={ds} stroke="#d03b3b" strokeWidth={1.5} label={{ value: "δ*", fill: c.text2, fontSize: 11, position: "top" }} />}
                    <ReferenceLine x={delta} stroke={c.text} strokeDasharray="3 3" />
                    <Line dataKey="cooperate" name="Cooperate" stroke={c.series[2]} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="deviate" name="Deviate (grim)" stroke={c.series[3]} strokeWidth={2} dot={false} isAnimationActive={false} />
                    {detail && <Line dataKey="deviate_nash_reversion" name="Deviate (Nash reversion)" stroke={c.series[3]} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid gap-5 xl:grid-cols-2">
                <ChartCard title="Round-robin tournament ranking" height={260} csv={data.tournament.ranking}
                  takeaway={`Average discounted payoff per day against all strategies (incl. itself), δ = ${fmt(delta, 2)}, noise ${pct(noise, 0)}.`}>
                  <ResponsiveContainer>
                    <BarChart data={data.tournament.ranking} layout="vertical" margin={{ top: 4, right: 48, bottom: 18, left: 8 }}>
                      <CartesianGrid {...ax.grid} horizontal={false} vertical />
                      <XAxis type="number" tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={compact} domain={["dataMin - 500", "dataMax + 200"]}
                        label={{ value: "INR per day (avg.)", position: "bottom", offset: 2, ...ax.labelStyle }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false} />
                      <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => inr(v)} />} />
                      <Bar dataKey="score" name="Score" radius={[0, 4, 4, 0]} isAnimationActive={false}
                        label={{ position: "right", fill: c.text2, fontSize: 11, formatter: (v: number) => compact(v) }}>
                        {data.tournament.ranking.map((r) => <Cell key={r.strategy} fill={c.series[STRAT_SLOT[r.strategy]]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {detail && <ChartCard title="Head-to-head payoffs (row strategy's average per day)" height="auto"
                  csv={data.tournament.strategies.flatMap((r, i) => data.tournament.strategies.map((cl, j) => ({ row: r, col: cl, payoff: data.tournament.payoff_matrix[i][j], cooperation: data.tournament.cooperation_matrix[i][j] })))}
                  takeaway="Darker = higher payoff for the row strategy. Cooperative strategies do well against each other but are exploited by Always Defect.">
                  {(() => {
                    const flat = data.tournament.payoff_matrix.flat();
                    const lo = Math.min(...flat), hi = Math.max(...flat);
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full border-separate text-center text-[12px]" style={{ borderSpacing: 2 }}>
                          <thead><tr><th />{data.tournament.strategies.map((s) => <th key={s} className="font-medium text-muted">{s}</th>)}</tr></thead>
                          <tbody>{data.tournament.strategies.map((r, i) => (
                            <tr key={r}><th className="pr-1 text-right font-medium text-ink2">{r}</th>
                              {data.tournament.payoff_matrix[i].map((v, j) => {
                                const t = (v - lo) / Math.max(1, hi - lo);
                                return <td key={j} className="num h-9 rounded-md font-semibold" title={`${name(r)} vs ${name(data.tournament.strategies[j])}: ${inr(v)}, cooperation ${pct(data.tournament.cooperation_matrix[i][j], 0)}`}
                                  style={{ background: seqColor(0.08 + 0.85 * t), color: t > 0.5 ? "#fff" : "#0b0b0b" }}>{compact(v)}</td>;
                              })}</tr>))}</tbody>
                        </table>
                      </div>
                    );
                  })()}
                </ChartCard>}
              </div>

              {match && (
                <ChartCard title="Cumulative discounted profit over days" height={300}
                  csv={match.cumulative[0].map((v, t) => ({ day: t + 1, [`A_${match.row}`]: v, [`B_${match.col}`]: match.cumulative[1][t], cooperation: match.cooperation_path[t] }))}
                  takeaway={`Platform A plays ${name(match.row)}, Platform B plays ${name(match.col)}: both cooperate ${pct(match.cooperation_rate, 0)} of days${noise > 0 ? " (averaged over noisy replications)" : ""}.`}
                  footer={<div className="flex flex-wrap items-center gap-3">
                    <Legend items={[{ label: `A: ${name(match.row)}`, color: c.A }, { label: `B: ${name(match.col)}`, color: c.B }]} />
                    <Select value={`${match.row}|${match.col}`} onChange={setMatchKey}
                      options={data.tournament.matches.map((m) => ({ value: `${m.row}|${m.col}`, label: `${m.row} vs ${m.col}` }))} />
                  </div>}>
                  <ResponsiveContainer>
                    <LineChart data={match.cumulative[0].map((v, t) => ({ day: t + 1, A: v, B: match.cumulative[1][t] }))} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
                      <CartesianGrid {...ax.grid} />
                      <XAxis dataKey="day" type="number" domain={[1, "dataMax"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
                        label={{ value: "Day", position: "bottom", offset: 6, ...ax.labelStyle }} />
                      <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={compact} width={52}
                        label={{ value: "Cumulative INR (discounted)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
                      <Tooltip content={<ChartTooltip labelFormatter={(l) => `Day ${l}`} valueFormatter={(v) => inr(v)} />} />
                      <Line dataKey="A" name={`A (${match.row})`} stroke={c.A} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="B" name={`B (${match.col})`} stroke={c.B} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              <ChartCard title="Imperfect observability: how much cooperation survives noise?" height={280} csv={data.noise_sweep}
                takeaway={(() => {
                  const r = data.noise_sweep.find((x) => x.noise === 0.05);
                  return r ? `With 5% of cooperative moves misread as defections, Grim Trigger cooperates only ${pct(r.GRIM, 0)} of days; Generous TFT keeps ${pct(r.GTFT, 0)}.` : "";
                })()}
                footer={<Legend items={["GRIM", "TFT", "GTFT"].map((s) => ({ label: name(s), color: c.series[STRAT_SLOT[s]] }))} />}>
                <ResponsiveContainer>
                  <LineChart data={data.noise_sweep} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
                    <CartesianGrid {...ax.grid} />
                    <XAxis dataKey="noise" type="number" domain={[0, "dataMax"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={(v) => pct(v, 0)}
                      label={{ value: "Probability a cooperative move is seen as defection", position: "bottom", offset: 6, ...ax.labelStyle }} />
                    <YAxis domain={[0, 1]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={(v) => pct(v, 0)} width={44}
                      label={{ value: "Days both cooperate", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => `noise ${pct(Number(l), 0)}`} valueFormatter={(v) => pct(v, 0)} />} />
                    {["GRIM", "TFT", "GTFT"].map((s) => (
                      <Line key={s} dataKey={s} name={name(s)} stroke={c.series[STRAT_SLOT[s]]} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.series[STRAT_SLOT[s]] }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <Note>{data.notes.map((n, i) => <p key={i} className="mb-1 last:mb-0">{n}</p>)}</Note>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
