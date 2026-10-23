import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Busy, ChartCard, ChartTooltip, ErrorBox, Loading, PageHeader, PlainWords, Select, useAxis } from "../components/ui";
import { ScenarioPicker } from "./Playground";
import { useApi } from "../lib/api";
import { compact, fmt, inr, pct } from "../lib/format";
import { useDetail } from "../lib/detail";
import { useParams } from "../lib/params";
import { MODEL_SLOT, useTheme } from "../lib/theme";

interface Sweep {
  param: string; label: string; scenario: string; baseline: number; models: string[]; metrics: string[];
  rows: Record<string, number | boolean>[]; all_verified: boolean;
}

const LABELS: Record<string, string> = {
  cournot: "Cournot", bertrand_incentive: "Bertrand (incentives)", bertrand_fee: "Bertrand (fees)",
  stackelberg_capacity: "Stackelberg (capacity)", stackelberg_incentive: "Stackelberg (incentives)",
  two_stage: "Two-stage", collusion: "Collusion", planner: "Planner",
};
const ALL = ["cournot", "bertrand_incentive", "bertrand_fee", "stackelberg_capacity", "stackelberg_incentive", "collusion", "planner"];
const BASIC_CHARTS = ["avg_delay", "total_profit", "total_incentive_spend", "efficiency"];
const BASIC_PARAMS = ["beta", "c", "k", "R", "Lambda"];
const CHARTS = [
  { key: "avg_delay", label: "Average delay", unit: "min", f: (v: number) => fmt(v, 1), tick: (v: number) => fmt(v, 0) },
  { key: "total_profit", label: "Total platform profit", unit: "INR/h", f: (v: number) => inr(v), tick: compact },
  { key: "total_incentive_spend", label: "Incentive spend", unit: "INR/h", f: (v: number) => inr(v), tick: compact },
  { key: "efficiency", label: "Efficiency (W / W*)", unit: "", f: (v: number) => pct(v, 1), tick: (v: number) => pct(v, 0) },
  { key: "w_A", label: "Platform A's incentive", unit: "INR/order", f: (v: number) => inr(v, 1), tick: (v: number) => fmt(v, 0) },
  { key: "total_completed", label: "Orders completed", unit: "orders/h", f: (v: number) => fmt(v, 0), tick: compact },
];

export default function Sensitivity() {
  const { params, scenario, config } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const { detail } = useDetail();
  const [param, setParam] = useState("beta");
  const [models, setModels] = useState(["cournot", "bertrand_incentive", "stackelberg_capacity", "collusion", "planner"]);
  const { data, loading, error } = useApi<Sweep>("/sensitivity", { param, scenario, params, models, points: 9 }, 400);
  const sp = config?.sensitivity_params ?? {};
  const toggle = (m: string) => setModels((ms) => (ms.includes(m) ? (ms.length > 1 ? ms.filter((x) => x !== m) : ms) : [...ms, m]));

  const takeaway = (key: string) => {
    if (!data) return "";
    const ref = data.models.includes("bertrand_incentive") ? "bertrand_incentive" : data.models[0];
    const first = data.rows[0], last = data.rows[data.rows.length - 1];
    const a = first[`${ref}__${key}`] as number, b = last[`${ref}__${key}`] as number;
    const fmtv = CHARTS.find((x) => x.key === key)!.f;
    const dir = b > a ? "rises" : "falls";
    return `${LABELS[ref]}: ${dir} from ${fmtv(a)} to ${fmtv(b)} as ${param === "Lambda" ? "Λ" : param} goes from ${fmt(first.value as number, 2)} to ${fmt(last.value as number, 2)}.`;
  };

  return (
    <div>
      <PageHeader kicker="Page 9 · what if?" title="Sensitivity Analysis">
        What happens to the results if one thing about the market changes? Pick a parameter and see each model's outcome as it moves.
      </PageHeader>
      <PlainWords>
        Each point is a full re-solve of the model at that parameter value. The dashed line marks today's (default) value.
        For example, pick “Rider incentive sensitivity β”: when riders switch apps more easily, the incentive war gets fiercer.
      </PlainWords>
      <div className="card card-pad mb-5 flex flex-wrap items-center gap-4">
        <Select label="Parameter" value={param} onChange={setParam}
          options={Object.entries(sp).filter(([k]) => detail || BASIC_PARAMS.includes(k)).map(([k, v]) => ({ value: k, label: v.label }))} />
        {param !== "Lambda" ? <ScenarioPicker /> : <span className="text-xs text-muted">Λ replaces the demand scenario.</span>}
        <Busy on={loading} />
        {data?.all_verified && <span className="chip"><CheckCircle2 size={13} className="text-[#0ca30c]" />{data.rows.length * data.models.length} equilibria verified</span>}
        <div className="flex w-full flex-wrap gap-1.5">
          {ALL.map((m) => (
            <button key={m} onClick={() => toggle(m)}
              className={clsx("chip transition", models.includes(m) ? "border-ink2/40 text-ink" : "opacity-50")}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.series[MODEL_SLOT[m]] }} />{LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      {!data ? <Loading tall label="Sweeping 9 values × models (planner solves dominate; ~10–20 s)…" /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          {CHARTS.filter((ch) => detail || BASIC_CHARTS.includes(ch.key)).map((ch) => {
            const rows = data.rows.map((r) => {
              const o: Record<string, number> = { value: r.value as number };
              data.models.forEach((m) => (o[m] = r[`${m}__${ch.key}`] as number));
              return o;
            });
            return (
              <ChartCard key={ch.key} title={`${ch.label} vs ${data.label}`} takeaway={takeaway(ch.key)} height={260} csv={rows}
                filename={`sensitivity-${param}-${ch.key}`}
                footer={<div className="flex flex-wrap gap-x-3 gap-y-1">{data.models.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1.5 text-xs text-ink2"><span className="h-0.5 w-4" style={{ background: c.series[MODEL_SLOT[m]] }} />{LABELS[m]}</span>))}</div>}>
                <ResponsiveContainer>
                  <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
                    <CartesianGrid {...ax.grid} />
                    <XAxis dataKey="value" type="number" domain={["dataMin", "dataMax"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
                      tickFormatter={(v) => fmt(v, v < 1 ? 2 : 0)} label={{ value: data.label, position: "bottom", offset: 6, ...ax.labelStyle }} />
                    <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={48} tickFormatter={ch.tick} domain={["auto", "auto"]}
                      label={ch.unit ? { value: ch.unit, angle: -90, position: "insideLeft", offset: 6, ...ax.labelStyle } : undefined} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => `${param} = ${fmt(Number(l), 3)}`} valueFormatter={(v) => ch.f(v)} />} />
                    {data.baseline !== null && data.baseline !== undefined && <ReferenceLine x={data.baseline} stroke={c.text} strokeDasharray="3 3" />}
                    {data.models.map((m) => (
                      <Line key={m} dataKey={m} name={LABELS[m]} stroke={c.series[MODEL_SLOT[m]]} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: c.series[MODEL_SLOT[m]] }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
