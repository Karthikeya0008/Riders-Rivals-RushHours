import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PayoffMatrix from "../components/PayoffMatrix";
import { Busy, ChartCard, ErrorBox, Loading, Note, PageHeader, PlainWords, Segmented, Select, Tex } from "../components/ui";
import { ScenarioPicker } from "./Playground";
import { post, useApi } from "../lib/api";
import { fmt, inr } from "../lib/format";
import { Advanced } from "../lib/detail";
import { useParams } from "../lib/params";
import { useTheme } from "../lib/theme";

interface Step {
  player: string;
  eliminated: string;
  dominated_by: { pure?: string; mixed?: Record<string, number> };
  kind: string;
  remaining_rows: string[];
  remaining_cols: string[];
}
interface Elim { kind: string; steps: Step[]; remaining_rows: string[]; remaining_cols: string[]; solved: boolean }
interface Mixed { row: number[]; col: number[]; payoff_row: number; payoff_col: number; pure: boolean }
interface Classification { is_pd: boolean; label: string; explanation: string; row: Record<string, number>; col: Record<string, number> }
interface Analysis {
  row_labels: string[];
  col_labels: string[];
  payoff_row: number[][];
  payoff_col: number[][];
  best_response_row: boolean[][];
  best_response_col: boolean[][];
  pure_nash: number[][];
  iesds: Elim;
  iewds: Elim;
  mixed_nash: Mixed[];
  maxmin: { row: { pure_index: number; pure_value: number; mixed: number[]; mixed_value: number }; col: { pure_index: number; pure_value: number; mixed: number[]; mixed_value: number } };
  classification?: Classification;
}
interface MarketMatrix {
  levels: number[];
  labels: string[];
  reference: { collusive: number; deviation: number; nash: number };
  cells: { delay: number[]; N: number[]; completed: number[]; incentive_spend: number[] }[][];
  full: Analysis;
  low_high: Analysis;
  notes: string[];
}

const PRESETS: Record<string, { rows: string[]; cols: string[]; A: number[][]; B: number[][] }> = {
  "Prisoner's Dilemma": { rows: ["Cooperate", "Defect"], cols: ["Cooperate", "Defect"], A: [[3, 0], [5, 1]], B: [[3, 5], [0, 1]] },
  "Matching Pennies": { rows: ["Heads", "Tails"], cols: ["Heads", "Tails"], A: [[1, -1], [-1, 1]], B: [[-1, 1], [1, -1]] },
  "Battle of the Sexes": { rows: ["Opera", "Football"], cols: ["Opera", "Football"], A: [[2, 0], [0, 1]], B: [[1, 0], [0, 2]] },
  "Stag Hunt": { rows: ["Stag", "Hare"], cols: ["Stag", "Hare"], A: [[4, 0], [3, 3]], B: [[4, 3], [0, 3]] },
  "Chicken": { rows: ["Swerve", "Straight"], cols: ["Swerve", "Straight"], A: [[0, -1], [1, -10]], B: [[0, 1], [-1, -10]] },
  "Dominance (2×3)": { rows: ["Up", "Down"], cols: ["Left", "Middle", "Right"], A: [[1, 1, 0], [0, 0, 2]], B: [[0, 2, 1], [3, 1, 0]] },
};

function MixBar({ labels, probs, color }: { labels: string[]; probs: number[]; color: string }) {
  return (
    <div className="space-y-1">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2 text-xs">
          <span className="w-20 truncate text-ink2">{l}</span>
          <div className="h-2.5 flex-1 rounded bg-line/60">
            <div className="h-2.5 rounded" style={{ width: `${probs[i] * 100}%`, background: color }} />
          </div>
          <span className="num w-12 text-right font-medium text-ink">{fmt(probs[i] * 100, 1)}%</span>
        </div>
      ))}
    </div>
  );
}

function stepText(s: Step) {
  const by = s.dominated_by.pure
    ? `“${s.dominated_by.pure}”`
    : `a mixture (${Object.entries(s.dominated_by.mixed ?? {}).map(([k, v]) => `${fmt(v * 100, 0)}% ${k}`).join(", ")})`;
  const who = s.player === "Row" ? "Platform A" : "Platform B";
  const always = s.kind === "strict" ? "always worse than" : "never better than";
  return `${who}: “${s.eliminated}” is ${always} ${by}, whatever the rival does, so a sensible ${who} never picks it. Cross it out.`;
}

function Analysis({ a, digits, cellTitle, editable, onEdit, rowName, colName, money }: {
  a: Analysis; digits: number; cellTitle?: (i: number, j: number) => string; editable?: boolean;
  onEdit?: (p: "A" | "B", i: number, j: number, v: number) => void; rowName?: string; colName?: string; money?: boolean;
}) {
  const { c } = useTheme();
  const [kind, setKind] = useState<"strict" | "weak">("strict");
  const elim = kind === "strict" ? a.iesds : a.iewds;
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setK(0); setPlaying(false); }, [a, kind]);
  useEffect(() => {
    if (!playing) return;
    if (k >= elim.steps.length) { setPlaying(false); return; }
    const t = setTimeout(() => setK((x) => x + 1), 1300);
    return () => clearTimeout(t);
  }, [playing, k, elim.steps.length]);
  const done = elim.steps.slice(0, k);
  const er = new Set(done.filter((s) => s.player === "Row").map((s) => s.eliminated));
  const ec = new Set(done.filter((s) => s.player === "Column").map((s) => s.eliminated));
  const f = (v: number) => (money ? inr(v) : fmt(v, 2));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <ChartCard title="Payoff matrix with best responses" height="auto"
          takeaway={<>{money && "Profits in thousands of ₹ per peak hour. "}Underlined payoffs are best responses (<span style={{ color: c.text2 }}>row player's in the A colour, column player's in the B colour</span>); a cell where both are underlined is a pure Nash equilibrium.</>}
          csv={a.row_labels.flatMap((r, i) => a.col_labels.map((cl, j) => ({ row: r, col: cl, payoff_row: a.payoff_row[i][j], payoff_col: a.payoff_col[i][j] })))}>
          <PayoffMatrix rowLabels={a.row_labels} colLabels={a.col_labels} A={a.payoff_row} B={a.payoff_col}
            brRow={a.best_response_row} brCol={a.best_response_col} nash={a.pure_nash} eliminatedRows={er} eliminatedCols={ec}
            digits={digits} cellTitle={cellTitle} editable={editable} onEdit={onEdit} rowName={rowName} colName={colName}
            format={money ? (v) => `${(v / 1000).toFixed(2)}k` : undefined} />
          <div className="mt-3 text-center text-sm text-ink2">
            {a.pure_nash.length === 0 ? "No pure-strategy Nash equilibrium." :
              <>Pure NE: {a.pure_nash.map(([i, j]) => `(${a.row_labels[i]}, ${a.col_labels[j]})`).join(", ")}</>}
          </div>
        </ChartCard>

        <div className="card card-pad">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="h-sec">Crossing out bad choices, step by step</div>
            <Advanced><Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "strict", label: "Strict (IESDS)" }, { value: "weak", label: "Weak (IEWDS)" }]} /></Advanced>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <button className="btn" onClick={() => { if (k >= elim.steps.length) setK(0); setPlaying((p) => !p); }} disabled={!elim.steps.length}>
              {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Pause" : "Animate"}
            </button>
            <button className="btn" onClick={() => setK((x) => Math.min(elim.steps.length, x + 1))} disabled={k >= elim.steps.length}><SkipForward size={14} />Step</button>
            <button className="btn" onClick={() => { setK(0); setPlaying(false); }}><RotateCcw size={14} />Reset</button>
            <span className="num ml-auto text-xs text-muted">step {k} / {elim.steps.length}</span>
          </div>
          {elim.steps.length === 0 ? (
            <Note>No strategy is {kind}ly dominated (not even by a mixed strategy), so elimination cannot narrow this game down.</Note>
          ) : (
            <ol className="space-y-1.5">
              {elim.steps.map((s, i) => (
                <li key={i} className={`rounded-md px-2.5 py-1.5 text-[13px] transition ${i < k ? "bg-accent/10 text-ink" : "text-muted"}`}>
                  <span className="num mr-2 font-semibold">{i + 1}.</span>{stepText(s)}
                </li>
              ))}
            </ol>
          )}
          {k >= elim.steps.length && elim.steps.length > 0 && (
            <div className="mt-3 text-sm text-ink">
              {elim.solved
                ? <>Dominance solvable: the unique survivor is <b>({elim.remaining_rows[0]}, {elim.remaining_cols[0]})</b>.</>
                : <>Survivors: rows {elim.remaining_rows.join(", ")}; columns {elim.remaining_cols.join(", ")}.</>}
              {kind === "weak" && <span className="text-muted"> (Weak elimination can depend on the order of removal.)</span>}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {a.classification && (
          <div className="card card-pad">
            <div className="label">2×2 game structure</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-sm font-bold ${a.classification.is_pd ? "bg-[#d03b3b]/15 text-[#d03b3b]" : "bg-line text-ink"}`}>{a.classification.label}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink2">{a.classification.explanation}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {(["T", "R", "P", "S"] as const).map((key) => (
                <div key={key} className="rounded-md bg-surface px-1 py-1.5">
                  <div className="text-[11px] text-muted">{{ T: "Temptation", R: "Reward", P: "Punishment", S: "Sucker" }[key]} {key}</div>
                  <div className="num text-sm font-semibold text-ink">{f(a.classification!.row[key])}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-center text-xs text-muted"><Tex>{"T > R > P > S"}</Tex> for both players ⇒ Prisoner's Dilemma</div>
          </div>
        )}
        <div className="card card-pad">
          <div className="h-sec mb-2">Nash equilibria <span className="text-xs font-normal text-muted">(how often each choice is played)</span></div>
          <div className="space-y-4">
            {a.mixed_nash.map((m, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex justify-between text-xs">
                  <span className="font-semibold text-ink">{m.pure ? "Pure" : "Mixed"} equilibrium {i + 1}</span>
                  <span className="num text-muted">payoffs {f(m.payoff_row)} / {f(m.payoff_col)}</span>
                </div>
                <div className="mb-1 text-[11px] text-muted">Row player (A)</div>
                <MixBar labels={a.row_labels} probs={m.row} color={c.A} />
                <div className="mb-1 mt-2 text-[11px] text-muted">Column player (B)</div>
                <MixBar labels={a.col_labels} probs={m.col} color={c.B} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">100% on one choice = a pure equilibrium. Split percentages = a mixed equilibrium, where each player randomises so the other cannot exploit them (as in Matching Pennies).</p>
        </div>
        <Advanced>
        <div className="card card-pad">
          <div className="h-sec mb-2">Maxmin (security) strategies</div>
          {(["row", "col"] as const).map((p) => {
            const mm = a.maxmin[p];
            const labels = p === "row" ? a.row_labels : a.col_labels;
            return (
              <div key={p} className="mb-3 last:mb-0">
                <div className="text-[13px] text-ink">
                  <b>{p === "row" ? "A" : "B"}</b>: pure maxmin “{labels[mm.pure_index]}” guarantees {f(mm.pure_value)}; the mixed maxmin guarantees {f(mm.mixed_value)}.
                </div>
                <div className="mt-1"><MixBar labels={labels} probs={mm.mixed} color={p === "row" ? c.A : c.B} /></div>
              </div>
            );
          })}
          <p className="mt-2 text-xs text-muted">The maxmin strategy maximises the worst-case payoff. It is the cautious choice when the rival's behaviour is unpredictable.</p>
        </div>
        </Advanced>
      </div>
    </div>
  );
}

function MarketMode() {
  const { params, scenario } = useParams();
  const [levels, setLevels] = useState<number[] | null>(null);
  const [view, setView] = useState<"full" | "low_high">("full");
  const { data, loading, error } = useApi<MarketMatrix>("/matrix-game", { scenario, params, levels });
  useEffect(() => setLevels(null), [scenario, params]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading tall />;
  const a = view === "full" ? data.full : data.low_high;
  const idx = view === "full" ? [0, 1, 2] : [0, data.levels.length - 1];
  return (
    <div className="space-y-5">
      <div className="card card-pad flex flex-wrap items-end gap-4">
        <ScenarioPicker />
        <Advanced>
        {data.labels.map((l, i) => (
          <label key={l} className="text-xs text-ink2">
            {l} incentive (₹/order)
            <input type="number" step={0.5} value={(levels ?? data.levels)[i]}
              onChange={(e) => { const next = [...(levels ?? data.levels)]; next[i] = parseFloat(e.target.value) || 0; setLevels(next); }}
              className="num mt-1 block w-24 rounded-md border border-line bg-panel px-2 py-1 text-sm text-ink" />
          </label>
        ))}
        <button className="btn" onClick={() => setLevels(null)} disabled={!levels}><RotateCcw size={14} />Auto levels</button>
        </Advanced>
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: "full", label: "3×3 Low/Med/High" }, { value: "low_high", label: "2×2 Low/High" }]} />
        <Busy on={loading} />
      </div>
      <Note>
        Each cell shows (A's profit, B's profit) in thousands of ₹ per peak hour, if A picks the row and B picks the column.
        <b> Low</b> = the friendly “let's both keep pay low” level, <b>High</b> = the most tempting way to cheat on that deal.
        <Advanced><br />Payoffs are hourly profits (₹) from the shared market model with fees fixed. Auto levels: <b>Low</b> = collusive incentive ₹{fmt(data.reference.collusive, 1)},{" "}
        <b>High</b> = most profitable one-shot deviation against Low ₹{fmt(data.reference.deviation, 1)}, <b>Medium</b> = midpoint.
        For reference, the continuous Bertrand equilibrium incentive is ₹{fmt(data.reference.nash, 1)}. Hover a cell for delays.</Advanced>
      </Note>
      <Analysis key={view + JSON.stringify(data.levels)} a={a} digits={0} money
        rowName="Platform A incentive" colName="Platform B incentive"
        cellTitle={(i, j) => {
          const cell = data.cells[idx[i]][idx[j]];
          return `Delay A ${fmt(cell.delay[0])} min, B ${fmt(cell.delay[1])} min · riders A ${fmt(cell.N[0], 0)}, B ${fmt(cell.N[1], 0)}`;
        }} />
    </div>
  );
}

function CustomMode() {
  const [preset, setPreset] = useState("Prisoner's Dilemma");
  const [game, setGame] = useState(PRESETS[preset]);
  const [res, setRes] = useState<Analysis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setGame(PRESETS[preset]), [preset]);
  const body = useMemo(() => ({ payoff_row: game.A, payoff_col: game.B, row_labels: game.rows, col_labels: game.cols }), [game]);
  useEffect(() => {
    const t = setTimeout(() => post<Analysis>("/matrix-game/custom", body).then((r) => { setRes(r); setErr(null); }).catch((e) => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [body]);
  const edit = (p: "A" | "B", i: number, j: number, v: number) => setGame((g) => {
    const M = (p === "A" ? g.A : g.B).map((r) => [...r]);
    M[i][j] = v;
    return p === "A" ? { ...g, A: M } : { ...g, B: M };
  });
  return (
    <div className="space-y-5">
      <div className="card card-pad flex flex-wrap items-center gap-3">
        <Select label="Textbook game" value={preset} onChange={setPreset} options={Object.keys(PRESETS).map((k) => ({ value: k, label: k }))} />
        <span className="text-xs text-muted">Edit any payoff: the analysis updates instantly.</span>
      </div>
      {err && <ErrorBox error={err} />}
      {res && <Analysis key={preset} a={res} digits={2} editable onEdit={edit} rowName="Row player" colName="Column player" />}
    </div>
  );
}

export default function StrategicLab() {
  const [mode, setMode] = useState<"market" | "custom">("market");
  return (
    <div>
      <PageHeader kicker="Page 4 · Modules 2, 3, 6" title="Strategic Form Lab">
        Rider pay is reduced to three simple options, Low, Medium and High, so the whole game fits in one table.
      </PageHeader>
      <PlainWords>
        A <b>payoff matrix</b> lists what each platform earns for every combination of choices. A choice is a <b>best response</b> if
        it earns the most given what the rival does (underlined). A cell where both choices are best responses is a <b>Nash equilibrium</b>:
        nobody wants to change. Here both platforms end up paying High even though both would earn more at Low.
        That trap is the <b>Prisoner's Dilemma</b>.
      </PlainWords>
      <div className="mb-5"><Segmented value={mode} onChange={setMode} options={[{ value: "market", label: "Market incentive game" }, { value: "custom", label: "Textbook games" }]} /></div>
      {mode === "market" ? <MarketMode /> : <CustomMode />}
    </div>
  );
}
