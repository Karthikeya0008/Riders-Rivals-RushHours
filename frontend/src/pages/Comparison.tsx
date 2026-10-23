import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Busy, ChartCard, ChartTooltip, ErrorBox, Loading, PageHeader, PlainWords, Segmented, useAxis } from "../components/ui";
import { useApi } from "../lib/api";
import { Advanced } from "../lib/detail";
import { compact, fmt, inr, pct } from "../lib/format";
import { useParams } from "../lib/params";
import { MODEL_SLOT, seqColor, useTheme } from "../lib/theme";
import type { CompareResult, CompareRow } from "../lib/types";

export const METRICS = [
  { key: "avg_delay", label: "Delivery time", unit: "min", f: (v: number) => fmt(v, 1), better: "lower" },
  { key: "total_completed", label: "Orders delivered", unit: "orders/h", f: (v: number) => fmt(v, 0), better: "higher" },
  { key: "total_profit", label: "Platform profit", unit: "INR/h", f: (v: number) => inr(v), better: "higher" },
  { key: "total_incentive_spend", label: "Paid to riders", unit: "INR/h", f: (v: number) => inr(v), better: "-" },
  { key: "efficiency", label: "Good for society", unit: "% of best possible", f: (v: number) => pct(v), better: "higher" },
] as const;

export function Heatmap({ data }: { data: CompareResult }) {
  const { c } = useTheme();
  const h = data.efficiency_heatmap;
  const labels = Object.fromEntries(data.models.map((m) => [m.id, m.label]));
  const flat = h.values.flat().filter((v) => v !== null);
  const lo = Math.min(...flat);
  const csv = h.models.flatMap((m, i) => h.scenarios.map((s, j) => ({ model: labels[m], scenario: s, efficiency: h.values[i][j] })));
  const worst = csv.reduce((a, b) => (b.efficiency < a.efficiency ? b : a));
  return (
    <ChartCard title="How close each model gets to the best possible outcome (efficiency)" height="auto" csv={csv} filename="efficiency-heatmap"
      takeaway={`100% = what an ideal planner would achieve. Darker = better. The weakest result is ${worst.model} at ${worst.scenario} demand (${pct(worst.efficiency)}).`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr><th className="text-left text-xs font-medium text-muted">Model \ demand</th>
              {h.scenarios.map((s) => <th key={s} className="text-center text-xs font-medium text-muted">{s} <span className="font-normal">({data.demand[s]})</span></th>)}</tr>
          </thead>
          <tbody>
            {h.models.map((m, i) => (
              <tr key={m}>
                <td className="whitespace-nowrap pr-2 text-[13px] text-ink2">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c.series[MODEL_SLOT[m]] }} />{labels[m]}
                </td>
                {h.values[i].map((v, j) => {
                  const t = (v - lo) / Math.max(1e-9, 1 - lo);
                  return (
                    <td key={j} title={`${labels[m]} · ${h.scenarios[j]}: ${pct(v, 2)}`}
                      className="num h-9 rounded-md text-center text-[13px] font-semibold"
                      style={{ background: seqColor(0.08 + 0.85 * t), color: t > 0.5 ? "#ffffff" : "#0b0b0b" }}>
                      {pct(v, 1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span>{pct(lo, 0)}</span>
          <span className="h-2 w-40 rounded" style={{ background: `linear-gradient(90deg, ${seqColor(0.08)}, ${seqColor(0.5)}, ${seqColor(0.93)})` }} />
          <span>100% (planner)</span>
        </div>
      </div>
    </ChartCard>
  );
}

function takeawayFor(metric: string, rows: CompareRow[], scen: string[]): string {
  const at = (m: string, s: string) => rows.find((r) => r.model === m && r.scenario === s);
  const last = scen[scen.length - 1];
  const b = at("bertrand_incentive", last), cn = at("cournot", last), col = at("collusion", last), pl = at("planner", last);
  if (!b || !cn || !col || !pl) return "";
  switch (metric) {
    case "avg_delay":
      return `At ${last} demand, incentive competition cuts delay to ${fmt(b.avg_delay)} min vs ${fmt(col.avg_delay)} under collusion, a gain of only ${fmt(col.avg_delay - b.avg_delay)} min; the planner reaches ${fmt(pl.avg_delay)} min with fees.`;
    case "total_completed":
      return `Incentive competition completes the most orders at ${last} demand (${fmt(b.total_completed, 0)}/h); fee-setting structures trade volume for margin.`;
    case "total_profit":
      return `The incentive war costs platforms: joint profit falls from ${inr(col.total_profit)} (collusion) to ${inr(b.total_profit)} at ${last} demand.`;
    case "total_incentive_spend":
      return `Bertrand-on-incentives spends ${fmt(b.total_incentive_spend / cn.total_incentive_spend, 1)}× what Cournot capacity competition spends at ${last} demand.`;
    default:
      return `Every structure loses some welfare relative to the planner; the gap widens at peaks for fixed-fee structures.`;
  }
}

export default function Comparison() {
  const { params } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const { data, loading, error } = useApi<CompareResult>("/compare", { params });
  const [metric, setMetric] = useState<string>("avg_delay");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tableScen, setTableScen] = useState("all");
  const M = METRICS.find((m) => m.key === metric)!;

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.scenarios.map((s) => {
      const row: Record<string, number | string> = { scenario: `${s} (${data.demand[s]})` };
      data.rows.filter((r) => r.scenario === s).forEach((r) => (row[r.model] = r[metric] as number));
      return row;
    });
  }, [data, metric]);

  if (error) return <div><PageHeader title="Model Comparison" /><ErrorBox error={error} /></div>;
  const labels = Object.fromEntries((data?.models ?? []).map((m) => [m.id, m.label]));
  const tableRows = data?.rows.filter((r) => tableScen === "all" || r.scenario === tableScen) ?? [];

  return (
    <div>
      <PageHeader kicker="Page 3 · all models side by side" title="Model Comparison">
        The same city, the same riders and the same customers, but eight different ways of competing, at four levels of
        demand. Pick a measure to compare them.
      </PageHeader>
      <PlainWords>
        Because every model uses exactly the same market, any difference you see comes only from <b>how</b> the platforms
        compete (what they choose, and who moves first), never from different assumptions.
      </PlainWords>
      {!data ? <Loading label="Solving 32 equilibria (first load takes ~20 s)…" tall /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
            {data.all_verified && <span className="chip"><CheckCircle2 size={13} className="text-[#0ca30c]" />All {data.rows.length} results checked</span>}
            <Busy on={loading} />
          </div>

          <ChartCard title={`${M.label} by model and demand scenario`} takeaway={takeawayFor(metric, data.rows, data.scenarios)}
            height={380} csv={chartData as Record<string, unknown>[]} filename={`compare-${metric}`}
            footer={
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {data.models.map((m) => (
                  <button key={m.id} onClick={() => setHidden((h) => { const n = new Set(h); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}
                    className={clsx("inline-flex items-center gap-1.5 text-xs", hidden.has(m.id) ? "text-muted line-through" : "text-ink2")}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.series[MODEL_SLOT[m.id]], opacity: hidden.has(m.id) ? 0.3 : 1 }} />{m.label}
                  </button>
                ))}
                <span className="text-muted">· click a model to hide it</span>
              </div>
            }>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 22, left: 8 }} barCategoryGap="18%" barGap={2}>
                <CartesianGrid {...ax.grid} />
                <XAxis dataKey="scenario" tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false}
                  label={{ value: "Demand scenario (orders/h)", position: "bottom", offset: 4, ...ax.labelStyle }} />
                <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={58}
                  tickFormatter={(v) => (metric === "efficiency" ? `${Math.round(v * 100)}%` : compact(v))}
                  domain={metric === "efficiency" ? [0.6, 1] : metric === "avg_delay" ? [25, "auto"] : [0, "auto"]} allowDataOverflow
                  label={{ value: `${M.label} (${M.unit})`, angle: -90, position: "insideLeft", offset: 0, ...ax.labelStyle }} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => M.f(v)} />} />
                {data.models.filter((m) => !hidden.has(m.id)).map((m) => (
                  <Bar key={m.id} dataKey={m.id} name={m.label} fill={c.series[MODEL_SLOT[m.id]]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Heatmap data={data} />

          <Advanced>
          <ChartCard title="Full results table" height="auto" csv={tableRows as Record<string, unknown>[]} filename="model-comparison"
            takeaway="Strategy values are in the model's own units (riders, INR incentive or INR fee). Download the CSV for every per-platform column.">
            <div className="mb-3"><Segmented size="sm" value={tableScen} onChange={setTableScen}
              options={[{ value: "all", label: "All" }, ...data.scenarios.map((s) => ({ value: s, label: s }))]} /></div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead className="sticky top-0 bg-panel">
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-2 font-medium">Scenario</th><th className="pr-2 font-medium">Model</th>
                    <th className="pr-2 text-right font-medium">Strategy A / B</th>
                    {METRICS.map((m) => <th key={m.key} className="pr-2 text-right font-medium">{m.label}</th>)}
                    <th className="pr-2 text-right font-medium">Welfare</th><th className="text-right font-medium">PoA</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.model + r.scenario} className="border-b border-line/60 hover:bg-surface">
                      <td className="py-1.5 pr-2 text-ink2">{r.scenario}</td>
                      <td className="pr-2 text-ink"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c.series[MODEL_SLOT[r.model]] }} />{labels[r.model]}</td>
                      <td className="num pr-2 text-right text-ink2">{r.variable}: {fmt(r.strategy_A, 1)} / {fmt(r.strategy_B, 1)}</td>
                      {METRICS.map((m) => <td key={m.key} className="num pr-2 text-right text-ink">{m.f(r[m.key] as number)}</td>)}
                      <td className="num pr-2 text-right text-ink">{inr(r.total_welfare)}</td>
                      <td className="num text-right text-ink2">{fmt(r.price_of_anarchy, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
          </Advanced>
        </div>
      )}
    </div>
  );
}
