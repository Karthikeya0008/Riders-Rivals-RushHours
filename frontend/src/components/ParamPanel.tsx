import { RotateCcw } from "lucide-react";
import { useDetail } from "../lib/detail";
import { useParams } from "../lib/params";
import { Slider, Toggle } from "./ui";

/* Basic view: four sliders with everyday names. Technical view: every market parameter. */
const BASIC: { key: string; label: string; hint: string }[] = [
  { key: "R", label: "Riders available in the city", hint: "Size of the shared rider pool" },
  { key: "beta", label: "How strongly riders chase higher pay", hint: "β: higher = riders switch platforms for small pay gaps" },
  { key: "c", label: "How much customers hate waiting", hint: "c: higher = long delays scare customers away" },
  { key: "p", label: "Delivery fee charged to customers", hint: "p in ₹ per order" },
];
const ALL = ["beta", "c", "k", "R", "w0", "p", "a_B", "b", "m", "d0", "s", "rho_max", "delay_cost", "F_A", "F_B"];

export default function ParamPanel() {
  const { config, market, setParam, reset, overrides, dominant, setDominant } = useParams();
  const { detail } = useDetail();
  if (!config) return null;
  const meta = config.param_meta;
  const row = (k: string, label?: string, hint?: string) => {
    const m = meta[k];
    if (!m || market[k] === undefined) return null;
    const digits = m.step >= 1 ? 0 : m.step >= 0.1 ? 1 : m.step >= 0.01 ? 2 : 3;
    return (
      <div key={k} title={hint}>
        <Slider label={<>{label ?? m.label}{k in overrides && <span className="ml-1 text-accent">•</span>}</>} value={market[k]}
          min={m.min} max={m.max} step={m.step} digits={digits} unit={m.unit ? ` ${m.unit}` : ""}
          onChange={(v) => {
            setParam(k, v);
            if (k === "a_B") setParam("a_A", dominant ? v + (market.dominant_bonus ?? 0.2) : v);
          }} />
      </div>
    );
  };
  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-sec">Try changing the market</div>
        <button className="btn-icon" onClick={reset} title="Reset all to defaults" aria-label="Reset parameters"><RotateCcw size={14} /></button>
      </div>
      <p className="text-xs text-muted">Changes apply to every page.</p>
      <Toggle checked={dominant} onChange={setDominant} label="Platform A is the bigger brand" />
      {detail ? ALL.map((k) => row(k)) : BASIC.map((b) => row(b.key, b.label, b.hint))}
      {!detail && <p className="text-[11px] text-muted">Turn on “Show technical details” (sidebar) for all {ALL.length} parameters.</p>}
    </div>
  );
}
