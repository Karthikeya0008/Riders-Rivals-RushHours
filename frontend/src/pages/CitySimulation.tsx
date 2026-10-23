import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, ErrorBar, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Busy, ChartCard, ChartTooltip, ErrorBox, Legend, Loading, MetricCard, Note, PageHeader, PlainWords, Segmented, Select, useAxis,
} from "../components/ui";
import { ScenarioPicker } from "./Playground";
import { useApi } from "../lib/api";
import { fmt, pct } from "../lib/format";
import { Advanced } from "../lib/detail";
import { useParams } from "../lib/params";
import { useTheme, type ChartColors } from "../lib/theme";

interface Frame { t: number; riders: number[]; orders: number[] }
interface Minute { t: number; [k: string]: number | null }
interface CI { mean: number | null; lo: number | null; hi: number | null; n: number }
interface Sim {
  scenario: string; model: string; model_label: string; seed: number; demand_rate: number;
  equilibrium: { w: number[]; p: number[]; delay: number[]; N: number[] };
  city: { size_km: number; hotspots: number[][]; restaurants: number[][] };
  frame_scale: number; frames: Frame[]; per_minute: Minute[];
  summary: Record<"A" | "B", { orders: number; delivered: number; cancelled: number; mean_delay: number; p90_delay: number; mean_active_riders: number; mean_rho: number; analytic_mean_delay: number }>;
  error: { mae: number; mape: number; bias: number };
  monte_carlo: {
    runs: number; band: Minute[];
    aggregate: Record<"A" | "B", { mean_delay: CI; analytic_mean_delay: CI; delivered: CI; cancelled: CI; mean_active_riders: CI; equilibrium_delay: number }>;
    error: Record<"mae" | "mape" | "bias", CI>;
  } | null;
}
interface Validation {
  runs: number; overall_mape: number;
  rows: { scenario: string; platform: string; sim_mean: number; sim_lo: number; sim_hi: number; analytic_realized: number; analytic_equilibrium: number; mae: number; mape: number; rho: number; cancelled: number }[];
  scatter: { rho: number; delay: number; scenario: string }[];
  fitted_delay_curve: { d0: number | null; s: number | null; points: number };
  curve: { rho: number; analytic: number; fitted: number | null }[];
  notes: string[];
}

const SPEEDS = [1, 3, 6, 12];

function decode(f: Frame) {
  const m = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < f.riders.length; i += 5) m.set(f.riders[i], [f.riders[i + 1], f.riders[i + 2], f.riders[i + 3], f.riders[i + 4]]);
  return m;
}

function CityCanvas({ sim, t, c }: { sim: Sim; t: number; c: ChartColors }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const decoded = useMemo(() => sim.frames.map(decode), [sim]);
  const [size, setSize] = useState(520);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.min(el.clientWidth, 640)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = size / sim.city.size_km;
    const sc = sim.frame_scale;
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    for (let km = 0; km <= sim.city.size_km; km += 5) {
      ctx.beginPath(); ctx.moveTo(km * k, 0); ctx.lineTo(km * k, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, km * k); ctx.lineTo(size, km * k); ctx.stroke();
    }
    ctx.fillStyle = c.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)";
    sim.city.hotspots.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * k, y * k, 2.6 * k, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = c.muted;
    sim.city.restaurants.forEach(([x, y]) => ctx.fillRect(x * k - 2.5, y * k - 2.5, 5, 5));

    const i0 = Math.max(0, Math.min(sim.frames.length - 1, Math.floor(t)));
    const i1 = Math.min(sim.frames.length - 1, i0 + 1);
    const f = t - i0;
    const fr = sim.frames[i0];
    // orders: waiting at restaurant (ring) and destinations of orders en route (cross)
    const col = [c.A, c.B];
    for (let i = 0; i < fr.orders.length; i += 4) {
      const x = (fr.orders[i] / sc) * k, y = (fr.orders[i + 1] / sc) * k, p = fr.orders[i + 2], st = fr.orders[i + 3];
      ctx.strokeStyle = col[p] ?? c.muted;
      ctx.lineWidth = 1.2;
      if (st === 0) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x - 2.5, y - 2.5); ctx.lineTo(x + 2.5, y + 2.5); ctx.moveTo(x + 2.5, y - 2.5); ctx.lineTo(x - 2.5, y + 2.5); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    const a = decoded[i0], b = decoded[i1];
    a.forEach(([x0, y0, p, ph], id) => {
      const nb = b.get(id);
      const x = nb ? x0 + (nb[0] - x0) * f : x0, y = nb ? y0 + (nb[1] - y0) * f : y0;
      const px = (x / sc) * k, py = (y / sc) * k;
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      if (ph === 0) { ctx.strokeStyle = col[p]; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = col[p]; ctx.fill(); }
    });
  }, [sim, decoded, t, size, c]);
  return <div ref={wrap} className="w-full"><canvas ref={ref} style={{ width: size, height: size }} className="mx-auto block rounded-lg border border-line" /></div>;
}

function LiveChart({ data, keys, labels, colors, now, title, unit, takeaway }: {
  data: Minute[]; keys: string[]; labels: string[]; colors: string[]; now: number; title: string; unit: string; takeaway: string;
}) {
  const ax = useAxis();
  const { c } = useTheme();
  return (
    <ChartCard title={title} takeaway={takeaway} height={150} csv={data.map((d) => Object.fromEntries([["minute", d.t], ...keys.map((k) => [k, d[k]])]))}
      footer={<Legend items={labels.map((l, i) => ({ label: l, color: colors[i] }))} />}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...ax.grid} />
          <XAxis dataKey="t" type="number" domain={[0, 180]} ticks={[0, 60, 120, 180]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} tickFormatter={(v) => `${v}m`} />
          <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={36} label={{ value: unit, angle: -90, position: "insideLeft", offset: 10, ...ax.labelStyle, fontSize: 10 }} />
          <Tooltip content={<ChartTooltip labelFormatter={(l) => `minute ${l}`} valueFormatter={(v) => fmt(v, 1)} />} />
          <ReferenceLine x={now} stroke={c.text} strokeDasharray="3 3" />
          {keys.map((k, i) => <Line key={k} dataKey={k} name={labels[i]} stroke={colors[i]} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}


function Player({ sim, onMinute }: { sim: Sim; onMinute: (m: number) => void }) {
  const { c } = useTheme();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const tRef = useRef(0);
  const lastMinute = useRef(-1);
  const report = useCallback((v: number) => {
    const mm = Math.floor(v);
    if (mm !== lastMinute.current) { lastMinute.current = mm; onMinute(mm); }
  }, [onMinute]);
  useEffect(() => { tRef.current = 0; setT(0); report(0); setPlaying(true); }, [sim, report]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const max = sim.frames.length - 1;
      tRef.current = Math.min(max, tRef.current + dt * speed);
      setT(tRef.current);
      report(tRef.current);
      if (tRef.current >= max) { setPlaying(false); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, sim, report]);
  const clock = `${String(18 + Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <div className="card card-pad">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => { if (tRef.current >= sim.frames.length - 1) tRef.current = 0; setPlaying((p) => !p); }}>
          {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Pause" : "Play"}
        </button>
        <button className="btn" onClick={() => { tRef.current = 0; setT(0); report(0); }}><RotateCcw size={14} />Restart</button>
        <Segmented size="sm" value={String(speed)} onChange={(v) => setSpeed(parseInt(v))} options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))} />
        <span className="num ml-auto text-sm text-ink">{clock}<span className="ml-1 text-xs text-muted">(minute {Math.floor(t)} · {speed} sim-min/s)</span></span>
      </div>
      <CityCanvas sim={sim} t={t} c={c} />
      <input type="range" min={0} max={sim.frames.length - 1} step={0.1} value={t} className="mt-3"
        onChange={(e) => { setPlaying(false); tRef.current = parseFloat(e.target.value); setT(tRef.current); report(tRef.current); }} aria-label="Simulation time" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.A }} />Rider A busy</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: c.A }} />Rider A idle</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.B }} />Rider B busy</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: c.B }} />Rider B idle</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border" style={{ borderColor: c.text2 }} />Order waiting for a rider</span>
        <span>× delivery destination</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2" style={{ background: c.muted }} />Restaurant</span>
      </div>
    </div>
  );
}

function ValidationPanel() {
  const { params, config } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const { data, loading, error } = useApi<Validation>("/simulate/validate", { params, runs: 10 });
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading label="Running 10 seeds × 4 scenarios (~15 s)…" />;
  const m = config?.defaults.market;
  const bars = data.rows.filter((r) => r.platform === "A").map((r) => ({
    scenario: r.scenario, sim: r.sim_mean, err: [r.sim_mean - r.sim_lo, r.sim_hi - r.sim_mean], analytic: r.analytic_realized, mape: r.mape, cancelled: r.cancelled,
  }));
  const pts = data.scatter.filter((_, i) => i % 2 === 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Simulated vs analytical mean delay (Platform A)" height={290} csv={data.rows}
          takeaway={`Average per-minute error ${pct(data.overall_mape, 0)} (MAPE). The simulation is close at peak; at moderate load the analytical function is conservative (it predicts more delay).`}
          footer={<Legend items={[{ label: `Simulated (mean of ${data.runs} seeds, 95% CI)`, color: c.A }, { label: "Analytical fixed point", color: c.text2 }]} />}>
          <ResponsiveContainer>
            <ComposedChart data={bars} margin={{ top: 8, right: 8, bottom: 18, left: 8 }}>
              <CartesianGrid {...ax.grid} />
              <XAxis dataKey="scenario" tick={{ ...ax.tick, fill: c.text2 }} axisLine={ax.axisLine} tickLine={false} />
              <YAxis domain={[20, "auto"]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={40}
                label={{ value: "Delay (min)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
              <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<ChartTooltip valueFormatter={(v) => fmt(v, 1)} />} />
              <Bar dataKey="sim" name="Simulated" fill={c.A} radius={[4, 4, 0, 0]} barSize={34} isAnimationActive={false}>
                <ErrorBar dataKey="err" width={6} stroke={c.text} strokeWidth={1.4} />
              </Bar>
              <Line dataKey="analytic" name="Analytical" stroke={c.text2} strokeWidth={2} dot={{ r: 5, fill: c.text2, strokeWidth: 0 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Delay vs utilisation: simulated minutes against the delay function" height={290}
          csv={data.curve}
          takeaway={data.fitted_delay_curve.d0 !== null
            ? `Least-squares fit to the simulated minutes: d0 = ${fmt(data.fitted_delay_curve.d0, 1)}, s = ${fmt(data.fitted_delay_curve.s, 2)} (model assumes d0 = ${m?.d0}, s = ${m?.s}). Simulated delay stays flat until utilisation nears 1.`
            : "Not enough data to fit."}
          footer={<Legend items={[{ label: "Simulated minute (all scenarios)", color: c.series[2] }, { label: "Model: d0 + s·ρ/(1−ρ)", color: c.text2 }, { label: "Fitted to simulation", color: c.series[6], dashed: true }]} />}>
          <ResponsiveContainer>
            <ComposedChart margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
              <CartesianGrid {...ax.grid} />
              <XAxis dataKey="rho" type="number" domain={[0, 1]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
                label={{ value: "Utilisation ρ = λ / (k·N)", position: "bottom", offset: 6, ...ax.labelStyle }} />
              <YAxis type="number" domain={[20, 80]} allowDataOverflow tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={40}
                label={{ value: "Delay (min)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => `ρ = ${fmt(Number(l), 2)}`} valueFormatter={(v) => fmt(v, 1)} />} />
              <Scatter data={pts} dataKey="delay" name="simulated" fill={c.series[2]} fillOpacity={0.35} shape="circle" isAnimationActive={false} />
              <Line data={data.curve} dataKey="analytic" name="model" stroke={c.text2} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line data={data.curve} dataKey="fitted" name="fitted" stroke={c.series[6]} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Busy on={loading} />
      <Note>{data.notes.map((n, i) => <p key={i} className="mb-1 last:mb-0">{n}</p>)}
        <p className="mt-1">The simulation also shows cancellations at extreme demand ({fmt(bars[bars.length - 1]?.cancelled, 0)} orders per platform over 3 h): customers give up after 20 minutes without a rider. The analytical model instead rations demand through delay.</p></Note>
    </div>
  );
}

export default function CitySimulation() {
  const { params, scenario } = useParams();
  const { c } = useTheme();
  const ax = useAxis();
  const [model, setModel] = useState("bertrand_incentive");
  const [seed, setSeed] = useState(42);
  const [runs, setRuns] = useState("20");
  const { data, loading, error } = useApi<Sim>("/simulate", { scenario, params, model, seed, mc_runs: parseInt(runs) }, 300);
  const [minute, setMinute] = useState(0);
  const [platform, setPlatform] = useState<"A" | "B">("A");

  if (error) return <div><PageHeader title="City Simulation" /><ErrorBox error={error} /></div>;
  const pm = data?.per_minute ?? [];
  const now = pm[Math.min(minute, pm.length - 1)];
  const mc = data?.monte_carlo;
  const band = mc?.band.map((r) => ({ ...r, range: [r[`sim_${platform}_lo`], r[`sim_${platform}_hi`]] })) ?? [];

  return (
    <div>
      <PageHeader kicker="Page 8 · watch the city" title="City Simulation">
        A virtual 20 × 20 km city during a 3-hour dinner rush, with every rider and order simulated one by one.
      </PageHeader>
      <PlainWords>
        Dots are riders (blue = Platform A, orange = Platform B; filled = busy, hollow = waiting for an order). Small squares are restaurants.
        Every 15 minutes riders pick an app based on the pay it offers. Orders go to the nearest free rider. Press <b>Play</b> and
        watch riders run out at the peak. The last chart checks our simple delay formula against this detailed simulation.
      </PlainWords>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ScenarioPicker />
        <Select label="Rider pay taken from" value={model} onChange={setModel} options={[
          { value: "bertrand_incentive", label: "Bertrand (incentives)" }, { value: "cournot", label: "Cournot (capacity)" },
          { value: "collusion", label: "Collusion" }, { value: "planner", label: "Social planner" }, { value: "two_stage", label: "Two-stage" }]} />
        <Advanced>
        <label className="inline-flex items-center gap-2 text-sm text-ink2">Seed
          <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || 0)} className="num w-20 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink" /></label>
        <Select label="Monte Carlo runs" value={runs} onChange={setRuns} options={["5", "10", "20"].map((v) => ({ value: v, label: v }))} />
        </Advanced>
        <Busy on={loading} />
      </div>
      {!data ? <Loading tall label="Simulating the peak…" /> : (
        <div className="space-y-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Player sim={data} onMinute={setMinute} />
            <div className="space-y-4">
              {now && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Orders waiting (queue)" a={fmt(now.queue_A as number, 0)} b={fmt(now.queue_B as number, 0)} />
                  <MetricCard label="Idle / online riders" a={`${fmt(now.idle_A as number, 0)} / ${fmt(now.active_A as number, 0)}`} b={`${fmt(now.idle_B as number, 0)} / ${fmt(now.active_B as number, 0)}`} />
                </div>
              )}
              <LiveChart data={pm} keys={["sim_delay_A", "sim_delay_B"]} labels={["A", "B"]} colors={[c.A, c.B]} now={minute}
                title="Average delay of orders placed each minute" unit="min" takeaway="Delays rise with the demand peak in the middle of the window." />
              <LiveChart data={pm} keys={["idle_A", "idle_B"]} labels={["A idle", "B idle"]} colors={[c.A, c.B]} now={minute}
                title="Idle riders" unit="riders" takeaway="The idle buffer shrinks at the peak; when it reaches zero, queues form." />
              <LiveChart data={pm} keys={["queue_A", "queue_B"]} labels={["A queue", "B queue"]} colors={[c.A, c.B]} now={minute}
                title="Orders waiting for a rider" unit="orders" takeaway="Queues appear only near saturation; long waits lead to cancellations." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Simulated delivery time" a={fmt(data.summary.A.mean_delay)} b={fmt(data.summary.B.mean_delay)} unit="min" />
            <MetricCard label="Formula's prediction" a={fmt(data.summary.A.analytic_mean_delay)} b={fmt(data.summary.B.analytic_mean_delay)} unit="min" />
            <MetricCard label="Delivered / cancelled" a={`${data.summary.A.delivered} / ${data.summary.A.cancelled}`} b={`${data.summary.B.delivered} / ${data.summary.B.cancelled}`} />
            <MetricCard label="Riders online (avg)" a={fmt(data.summary.A.mean_active_riders, 0)} b={fmt(data.summary.B.mean_active_riders, 0)} unit={`eq. ${fmt(data.equilibrium.N[0], 0)}`} />
          </div>

          {mc && (
            <ChartCard title={`Does the simple delay formula match the simulation? (Platform ${platform})`} height={320} csv={mc.band}
              takeaway={`Solid line: simulation averaged over ${mc.runs} random runs (shaded = 95% range). Dashed: our formula. Average gap ${fmt(mc.error.mae.mean, 1)} min.`}
              footer={<div className="flex flex-wrap items-center gap-3">
                <Legend items={[{ label: "Simulated mean", color: platform === "A" ? c.A : c.B }, { label: "Analytical (quasi-static)", color: c.text2, dashed: true }]} />
                <Segmented size="sm" value={platform} onChange={setPlatform} options={[{ value: "A", label: "Platform A" }, { value: "B", label: "Platform B" }]} />
              </div>}>
              <ResponsiveContainer>
                <ComposedChart data={band} margin={{ top: 8, right: 16, bottom: 22, left: 8 }}>
                  <CartesianGrid {...ax.grid} />
                  <XAxis dataKey="t" type="number" domain={[0, 180]} ticks={[0, 30, 60, 90, 120, 150, 180]} tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine}
                    label={{ value: "Minute of the peak window (18:00 → 21:00)", position: "bottom", offset: 6, ...ax.labelStyle }} />
                  <YAxis tick={ax.tick} axisLine={ax.axisLine} tickLine={ax.tickLine} width={40} domain={["auto", "auto"]}
                    label={{ value: "Delay (min)", angle: -90, position: "insideLeft", offset: 4, ...ax.labelStyle }} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => `minute ${l}`} valueFormatter={(v) => fmt(v, 1)} />} />
                  <Area dataKey="range" name="95% CI" stroke="none" fill={platform === "A" ? c.A : c.B} fillOpacity={0.18} isAnimationActive={false} connectNulls />
                  <Line dataKey={`sim_${platform}`} name="Simulated" stroke={platform === "A" ? c.A : c.B} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Line dataKey={`analytic_${platform}`} name="Analytical" stroke={c.text2} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          <Advanced>
            <div>
              <h2 className="h-sec mb-3">Validation across all demand scenarios</h2>
              <ValidationPanel />
            </div>
          </Advanced>
        </div>
      )}
    </div>
  );
}
