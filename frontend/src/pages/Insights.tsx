import { Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, ChartTooltip, ErrorBox, Legend, Loading, PageHeader, useAxis } from "../components/ui";
import { useApi } from "../lib/api";
import { compact, fmt, inr, pct } from "../lib/format";
import { useParams } from "../lib/params";
import { useTheme } from "../lib/theme";

type Row = Record<string, number | string | null>;
interface Insight { id: string; title: string; text: string; data: Row[] }

function Mini({ insight }: { insight: Insight }): ReactNode {
  const { c } = useTheme();
  const ax = useAxis();
  const d = insight.data;
  const common = { margin: { top: 8, right: 12, bottom: 4, left: 4 } };
  const x = <XAxis dataKey="scenario" tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false} />;
  switch (insight.id) {
    case "incentive_war":
      return (
        <ChartCard title="Share of the extra incentive spend that becomes rider surplus" height={200} csv={d}
          takeaway="Cartel → incentive competition, by demand level.">
          <ResponsiveContainer><BarChart data={d} {...common}><CartesianGrid {...ax.grid} />{x}
            <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={40} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => pct(v, 0)} />} />
            <Bar dataKey="rider_share" name="Rider share" fill={c.series[6]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
      );
    case "first_mover":
      return (
        <ChartCard title="First-mover advantage (INR/h)" height={200} csv={d}
          footer={<Legend items={[{ label: "Capacity leadership", color: c.series[3] }, { label: "Incentive leadership", color: c.series[4] }]} />}>
          <ResponsiveContainer><BarChart data={d} {...common} barGap={2}><CartesianGrid {...ax.grid} />{x}
            <YAxis tickFormatter={compact} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={44} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => inr(v)} />} />
            <Bar dataKey="capacity_fma" name="Capacity" fill={c.series[3]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="incentive_fma" name="Incentive" fill={c.series[4]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
      );
    case "cooperation":
      return (
        <ChartCard title="Critical discount factor δ* by demand level" height={200} csv={d}
          footer={<Legend items={[{ label: "Grim trigger (2×2 punishment)", color: c.series[6] }, { label: "Nash reversion", color: c.series[2] }]} />}>
          <ResponsiveContainer><LineChart data={d} {...common}><CartesianGrid {...ax.grid} />{x}
            <YAxis domain={[0, 1]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={36} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => fmt(v, 3)} />} />
            <Line dataKey="delta_star" name="δ* grim" stroke={c.series[6]} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.series[6] }} isAnimationActive={false} />
            <Line dataKey="delta_star_nash" name="δ* Nash reversion" stroke={c.series[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.series[2] }} isAnimationActive={false} />
          </LineChart></ResponsiveContainer>
        </ChartCard>
      );
    case "kreps_scheinkman":
      return (
        <ChartCard title="Capacity per platform: two-stage SPE vs Cournot" height={200} csv={d}
          footer={<Legend items={[{ label: "Two-stage", color: c.series[5] }, { label: "Cournot", color: c.series[0] }]} />}>
          <ResponsiveContainer><BarChart data={d} {...common} barGap={2}><CartesianGrid {...ax.grid} />{x}
            <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={36} domain={[0, "auto"]} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => fmt(v, 1)} />} />
            <Bar dataKey="two_stage_N" name="Two-stage" fill={c.series[5]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="cournot_N" name="Cournot" fill={c.series[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart></ResponsiveContainer>
        </ChartCard>
      );
    case "peak":
      return (
        <ChartCard title="Average delay: incentive competition vs planner (min)" height={200} csv={d}
          footer={<Legend items={[{ label: "Bertrand (incentives)", color: c.series[1] }, { label: "Planner", color: c.series[7] }]} />}>
          <ResponsiveContainer><LineChart data={d} {...common}><CartesianGrid {...ax.grid} />{x}
            <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={36} domain={["auto", "auto"]} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => fmt(v, 1)} />} />
            <Line dataKey="bertrand_delay" name="Bertrand" stroke={c.series[1]} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.series[1] }} isAnimationActive={false} />
            <Line dataKey="planner_delay" name="Planner" stroke={c.series[7]} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: c.series[7] }} isAnimationActive={false} />
          </LineChart></ResponsiveContainer>
        </ChartCard>
      );
    case "efficiency":
      return (
        <ChartCard title="Best and worst structure by demand level" height="auto" csv={d}>
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1 font-medium">Demand</th><th className="font-medium">Best</th><th className="font-medium">Worst</th></tr></thead>
            <tbody>{d.map((r) => (
              <tr key={String(r.scenario)} className="border-b border-line/60">
                <td className="py-1.5 text-ink2">{r.scenario}</td>
                <td className="text-ink">{r.best} <span className="num text-muted">({pct(r.best_eff as number)})</span></td>
                <td className="text-ink">{r.worst} <span className="num text-muted">({pct(r.worst_eff as number)})</span></td></tr>))}</tbody>
          </table>
        </ChartCard>
      );
    default:
      return null;
  }
}

export default function Insights() {
  const { params, overrides } = useParams();
  const { data, error } = useApi<{ insights: Insight[]; scenarios: string[] }>("/insights", { params });
  return (
    <div>
      <PageHeader kicker="Page 11 · auto-generated from the comparison" title="Key Insights">
        Each finding is generated from the solved models: the numbers update if you change any market parameter
        {Object.keys(overrides).length > 0 ? " (you are currently viewing a modified parameter set)" : " (currently: default parameters)"}.
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {!data ? <Loading tall label="Solving every model, scenario and repeated game (~20 s on first load)…" /> : (
        <div className="space-y-5">
          {data.insights.map((ins, i) => (
            <div key={ins.id} className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="card card-pad">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    {i === 0 ? <Lightbulb size={16} /> : <span className="num text-sm font-bold">{i + 1}</span>}
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-semibold text-ink">{ins.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink2">{ins.text}</p>
                  </div>
                </div>
              </div>
              <Mini insight={ins} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
