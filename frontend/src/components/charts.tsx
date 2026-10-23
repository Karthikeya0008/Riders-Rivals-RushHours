import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { useDetail } from "../lib/detail";
import { compact, fmt, inr } from "../lib/format";
import { useTheme } from "../lib/theme";
import type { ModelResult, Outcome } from "../lib/types";
import { ChartCard, ChartTooltip, Legend, useAxis } from "./ui";

/* Best-response curves in (s_A, s_B) space with the Nash equilibrium and the BR-iteration path. */
export function BRChart({ res, height = 340 }: { res: ModelResult; height?: number }) {
  const { c } = useTheme();
  const ax = useAxis();
  const { detail } = useDetail();
  const curves = res.br_curves;
  if (!curves) return null;
  const sym = res.strategy_variable.symbol;
  const unit = res.strategy_variable.unit;
  const path = detail ? (res.convergence.path ?? []).map(([x, y]) => ({ x, y })) : [];
  const all = [...curves.A, ...curves.B];
  const lo = Math.min(...all.map((p) => Math.min(p.x, p.y)));
  const hi = Math.max(...all.map((p) => Math.max(p.x, p.y)));
  const eq = res.equilibrium;
  const csv = [
    ...curves.A.map((p) => ({ curve: "BR_A(s_B)", s_A: p.x, s_B: p.y })),
    ...curves.B.map((p) => ({ curve: "BR_B(s_A)", s_A: p.x, s_B: p.y })),
  ];
  return (
    <ChartCard
      title={`Best-response curves (${res.label})`}
      takeaway={detail
        ? <>The curves cross at the Nash equilibrium ({sym}<sub>A</sub>, {sym}<sub>B</sub>) = ({fmt(eq.A, 1)}, {fmt(eq.B, 1)}) {unit}; the dashed path shows best-response iteration converging there.</>
        : <>Each line shows a platform's best choice for every choice of its rival. Where the lines cross (black dot), both are already doing their best: that is the Nash equilibrium ({fmt(eq.A, 1)}, {fmt(eq.B, 1)}) {unit}.</>}
      csv={csv} filename={`br-curves-${res.model}-${res.scenario}`} height={height}
      footer={<Legend items={[{ label: `A's best choice for each B choice`, color: c.A }, { label: `B's best choice for each A choice`, color: c.B },
        ...(detail ? [{ label: "BR iteration path", color: c.muted, dashed: true }] : [])]} />}>
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 16, bottom: 22, left: 4 }}>
          <CartesianGrid {...ax.grid} vertical />
          <XAxis type="number" dataKey="x" domain={[Math.floor(lo), Math.ceil(hi)]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
            label={{ value: `Platform A: ${res.strategy_variable.name} (${unit})`, position: "bottom", offset: 6, ...ax.labelStyle }} allowDataOverflow />
          <YAxis type="number" dataKey="y" domain={[Math.floor(lo), Math.ceil(hi)]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={44}
            label={{ value: `Platform B (${unit})`, angle: -90, position: "insideLeft", offset: 10, ...ax.labelStyle }} allowDataOverflow />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => `${sym}_A = ${fmt(Number(l), 2)}`} />} />
          <Line data={curves.A} dataKey="y" name={`BR_A (${sym}_B on y)`} stroke={c.A} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line data={curves.B} dataKey="y" name={`BR_B (${sym}_B)`} stroke={c.B} strokeWidth={2} dot={false} isAnimationActive={false} />
          {path.length > 1 && (
            <Line data={path} dataKey="y" name="iteration" stroke={c.muted} strokeDasharray="4 3" strokeWidth={1.2}
              dot={{ r: 2, fill: c.muted, stroke: "none" }} isAnimationActive={false} legendType="none" />
          )}
          <ReferenceDot x={eq.A} y={eq.B} r={7} fill={c.text} stroke={c.surface} strokeWidth={2}
            label={{ value: "NE", position: "right", fill: c.text, fontSize: 12, fontWeight: 600 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* Welfare decomposition for one outcome. */
export function WelfareBars({ o, title = "Where the surplus goes", height = 230 }: { o: Outcome; title?: string; height?: number }) {
  const { c } = useTheme();
  const ax = useAxis();
  const data = [
    { name: "Consumers", value: o.consumer_surplus, color: c.series[2] },
    { name: "Platform A", value: o.profit[0], color: c.A },
    { name: "Platform B", value: o.profit[1], color: c.B },
    { name: "Riders", value: o.rider_surplus, color: c.series[6] },
  ];
  const share = (v: number) => (o.total_welfare ? (100 * v) / o.total_welfare : 0);
  return (
    <ChartCard title={title} height={height}
      takeaway={`Total welfare ${inr(o.total_welfare)}/h. Riders capture ${fmt(share(o.rider_surplus), 0)}%, platforms ${fmt(share(o.total_profit), 0)}%, consumers ${fmt(share(o.consumer_surplus), 0)}%.`}
      csv={data.map(({ name, value }) => ({ group: name, inr_per_hour: value }))}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 18, left: 8 }} barCategoryGap={10}>
          <CartesianGrid {...ax.grid} horizontal={false} vertical />
          <XAxis type="number" tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={compact}
            label={{ value: "INR per peak hour", position: "bottom", offset: 2, ...ax.labelStyle }} />
          <YAxis type="category" dataKey="name" tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false} width={84} />
          <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<ChartTooltip valueFormatter={(v) => inr(v)} />} />
          <ReferenceLine x={0} stroke={c.axis} />
          <Bar dataKey="value" name="Surplus" radius={[0, 4, 4, 0]} isAnimationActive={false}
            label={{ position: "right", fill: c.text2, fontSize: 11, formatter: (v: number) => compact(v) }}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* 100% split of customers (A / B / outside) and riders (A / B / offline). */
export function SplitBars({ o }: { o: Outcome }) {
  const { c } = useTheme();
  const R = o.N[0] + o.N[1] + o.N0;
  const rows = [
    { name: "Customers", A: o.market_share[0], B: o.market_share[1], out: o.outside_share,
      labels: ["Platform A", "Platform B", "Don't order"] },
    { name: "Riders", A: o.N[0] / R, B: o.N[1] / R, out: o.N0 / R, labels: ["Platform A", "Platform B", "Offline"] },
  ];
  return (
    <ChartCard title="Who goes where" height="auto"
      takeaway={`${fmt((o.market_share[0] + o.market_share[1]) * 100, 0)}% of potential orders reach a platform; ${fmt(((o.N[0] + o.N[1]) / R) * 100, 0)}% of the rider pool is online.`}
      csv={rows.map(({ name, A, B, out }) => ({ group: name, A, B, outside: out }))}>
      <div className="space-y-4 py-1">
        {rows.map((r) => (
          <div key={r.name}>
            <div className="mb-1 text-xs text-ink2">{r.name}</div>
            <div className="flex h-6 w-full overflow-hidden rounded-md">
              {[r.A, r.B, r.out].map((v, i) => (
                <div key={i} title={`${r.labels[i]}: ${fmt(v * 100, 1)}%`}
                  style={{ width: `${v * 100}%`, background: [c.A, c.B, c.neutral][i], marginRight: i < 2 ? 2 : 0 }}
                  className="flex items-center justify-center text-[11px] font-semibold text-white">
                  {v > 0.09 ? `${fmt(v * 100, 0)}%` : ""}
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-3 text-[11px] text-muted">
              {r.labels.map((l, i) => <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: [c.A, c.B, c.neutral][i] }} />{l}</span>)}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
