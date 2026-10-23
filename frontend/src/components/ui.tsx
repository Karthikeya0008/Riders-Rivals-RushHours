import clsx from "clsx";
import katex from "katex";
import { AlertTriangle, CheckCircle2, Download, Image as ImageIcon, Info, Lightbulb, Loader2, XCircle } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useDetail } from "../lib/detail";
import { downloadCsv, exportPng } from "../lib/export";
import { fmt } from "../lib/format";
import { useTheme } from "../lib/theme";
import type { Verification } from "../lib/types";

/* ---------------------------------------------------------------- page scaffolding */
export function PageHeader({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {kicker && <div className="label mb-1">{kicker}</div>}
      <h1 className="h-page">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink2">{children}</div>}
    </header>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="h-sec">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- chart card with PNG/CSV export */
export function ChartCard({
  title,
  takeaway,
  children,
  csv,
  filename,
  height = 300,
  className,
  footer,
}: {
  title: string;
  takeaway?: ReactNode;
  children: ReactNode;
  csv?: Record<string, unknown>[];
  filename?: string;
  height?: number | "auto";
  className?: string;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { c } = useTheme();
  const name = filename ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <figure ref={ref} className={clsx("card card-pad flex flex-col", className)}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
          {takeaway && <p className="mt-0.5 text-[13px] leading-snug text-ink2">{takeaway}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5" data-no-export="true">
          <button className="btn-icon" title="Download PNG" aria-label="Download chart as PNG"
            onClick={() => exportPng(ref.current, name, c.surface)}>
            <ImageIcon size={15} />
          </button>
          {csv && (
            <button className="btn-icon" title="Download CSV" aria-label="Download data as CSV"
              onClick={() => downloadCsv(csv, name)}>
              <Download size={15} />
            </button>
          )}
        </div>
      </div>
      <div style={height === "auto" ? undefined : { height }} className="min-w-0">{children}</div>
      {footer && <div className="mt-2 text-xs text-muted">{footer}</div>}
    </figure>
  );
}

/* ---------------------------------------------------------------- metric card (A vs B) */
export function MetricCard({ label, a, b, unit, total, hint }: {
  label: string; a?: string; b?: string; unit?: string; total?: string; hint?: string;
}) {
  return (
    <div className="card px-4 py-3" title={hint}>
      <div className="label">{label}</div>
      {total !== undefined && <div className="num mt-1 text-xl font-semibold text-ink">{total}<span className="ml-1 text-xs font-normal text-muted">{unit}</span></div>}
      {a !== undefined && (
        <div className="mt-1 space-y-0.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-ink2"><span className="h-2 w-2 rounded-full bg-pa" />A</span>
            <span className="num font-semibold text-ink">{a}<span className="ml-1 text-xs font-normal text-muted">{total === undefined ? unit : ""}</span></span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-ink2"><span className="h-2 w-2 rounded-full bg-pb" />B</span>
            <span className="num font-semibold text-ink">{b}<span className="ml-1 text-xs font-normal text-muted">{total === undefined ? unit : ""}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="num mt-1 text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- maths */
export function Tex({ children, block }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: !!block, throwOnError: false, strict: false }),
    [children, block],
  );
  return block ? <div className="text-ink" dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="text-ink" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------------------------------------------------------------- inputs */
export function Slider({ label, value, min, max, step, onChange, unit, digits = 2, marker }: {
  label: ReactNode; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
  unit?: string; digits?: number; marker?: { value: number; label: string };
}) {
  return (
    <label className="block">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink2">{label}</span>
        <span className="num text-[13px] font-semibold text-ink">{fmt(value, digits)}{unit && <span className="ml-0.5 font-normal text-muted">{unit}</span>}</span>
      </div>
      <div className="relative">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))} />
        {marker && marker.value >= min && marker.value <= max && (
          <div className="pointer-events-none absolute -top-1 h-[26px] w-0.5 rounded bg-[#d03b3b]"
            style={{ left: `calc(${((marker.value - min) / (max - min)) * 100}% - 1px)` }}
            title={marker.label} />
        )}
      </div>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={clsx("rounded-md font-medium transition",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
            o.value === value ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, options, onChange, label }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      {label && <span className="text-ink2">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink2">
      <span className={clsx("relative h-5 w-9 rounded-full transition", checked ? "bg-accent" : "bg-line")}>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      <span>{label}</span>
    </label>
  );
}

/* ---------------------------------------------------------------- status */
export function Loading({ label = "Solving…", tall }: { label?: string; tall?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-center gap-2 text-sm text-muted", tall ? "h-72" : "h-24")}>
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="card card-pad flex items-start gap-3 border-[#d03b3b]/40">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#d03b3b]" />
      <div className="text-sm text-ink2">
        <div className="font-semibold text-ink">Could not reach the model engine</div>
        <div className="mt-0.5">{error}</div>
        <div className="mt-1 text-muted">Is the backend running? Start it with <code className="font-mono">.\start-backend.ps1</code>.</div>
      </div>
    </div>
  );
}

export function Busy({ on }: { on: boolean }) {
  return on ? <Loader2 size={14} className="animate-spin text-muted" aria-label="updating" /> : null;
}

export function VerificationBadge({ v, label = "Equilibrium verified" }: { v: Verification | undefined; label?: string }) {
  const [open, setOpen] = useState(false);
  const { detail } = useDetail();
  if (!v) return null;
  if (!detail) {
    return (
      <span className={clsx("chip", v.passed ? "border-[#0ca30c]/40" : "border-[#d03b3b]/50")}
        title="The app checked that neither platform could earn more by changing its choice on its own.">
        {v.passed ? <CheckCircle2 size={13} className="text-[#0ca30c]" /> : <XCircle size={13} className="text-[#d03b3b]" />}
        <span className="text-ink">{v.passed ? "Checked: no one gains by switching alone" : "Check failed"}</span>
      </span>
    );
  }
  const players = v.players ?? v.stage1?.players ?? [];
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)}
        className={clsx("chip", v.passed ? "border-[#0ca30c]/40" : "border-[#d03b3b]/50")}>
        {v.passed ? <CheckCircle2 size={13} className="text-[#0ca30c]" /> : <XCircle size={13} className="text-[#d03b3b]" />}
        <span className="text-ink">{v.passed ? label : "Verification failed"}</span>
        <Info size={12} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-line bg-panel p-3 text-xs shadow-lg">
          <div className="mb-1 font-semibold text-ink">
            {v.kind === "joint-optimum" ? "Optimality check" : "Unilateral deviation check"}
          </div>
          <p className="mb-2 text-ink2">
            {v.kind === "joint-optimum"
              ? `No point on a ${v.grid_points}-point grid improves the objective (gain ${fmt(v.gain ?? 0, 2)} ≤ tolerance ${fmt(v.tolerance ?? 0, 2)}).`
              : `Each player's payoff was evaluated at ${v.grid_points ?? "many"} alternative strategies (plus local polishing) holding the rival fixed.`}
          </p>
          {players.length > 0 && (
            <table className="w-full num">
              <thead><tr className="text-muted"><th className="text-left font-medium">Player</th><th className="text-right font-medium">Best gain</th><th className="text-right font-medium">Tol.</th><th /></tr></thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={i}><td className="text-ink2">{p.player}{p.type ? ` (${p.type})` : ""}</td>
                    <td className="text-right text-ink">{fmt(p.gain, 3)}</td>
                    <td className="text-right text-muted">{fmt(p.tolerance, 1)}</td>
                    <td className="pl-1">{p.passed ? "✓" : "✗"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {v.leader && <p className="mt-2 text-ink2">Leader commitment checked on {v.leader.grid_points} alternatives with the follower re-optimising: gain {fmt(v.leader.gain, 2)}.</p>}
          {v.stage2 && <p className="mt-2 text-ink2">Fee stage at the SPE capacities: {v.stage2.passed ? "no profitable fee deviation" : "failed"}.</p>}
        </div>
      )}
    </div>
  );
}

/* Short plain-language explanation shown at the top of a page or model. */
export function PlainWords({ title = "In plain words", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-5 flex gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
      <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="text-[14px] leading-relaxed text-ink2">
        <div className="mb-0.5 font-semibold text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink2">{children}</div>;
}

/* ---------------------------------------------------------------- recharts helpers */
export function useAxis() {
  const { c } = useTheme();
  return {
    tick: { fill: c.muted, fontSize: 11 },
    axisLine: { stroke: c.axis },
    tickLine: { stroke: c.axis },
    grid: { stroke: c.grid, strokeDasharray: "0", vertical: false },
    labelStyle: { fill: c.text2, fontSize: 12 },
  };
}

interface TipItem { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: {
  active?: boolean; payload?: TipItem[]; label?: unknown;
  labelFormatter?: (l: unknown) => ReactNode; valueFormatter?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-semibold text-ink">{labelFormatter ? labelFormatter(label) : String(label)}</div>}
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}
          </span>
          <span className="num font-medium text-ink">
            {typeof p.value === "number" ? (valueFormatter ? valueFormatter(p.value, String(p.name)) : fmt(p.value, 2)) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: it.dashed ? "none" : it.color, borderTop: it.dashed ? `2px dashed ${it.color}` : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
