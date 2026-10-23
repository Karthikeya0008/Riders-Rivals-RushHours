import clsx from "clsx";
import { motion } from "framer-motion";
import { fmt } from "../lib/format";
import { useTheme } from "../lib/theme";

export interface MatrixProps {
  rowLabels: string[];
  colLabels: string[];
  A: number[][];
  B: number[][];
  brRow?: boolean[][];
  brCol?: boolean[][];
  nash?: number[][];
  eliminatedRows?: Set<string>;
  eliminatedCols?: Set<string>;
  digits?: number;
  cellTitle?: (i: number, j: number) => string;
  editable?: boolean;
  onEdit?: (player: "A" | "B", i: number, j: number, v: number) => void;
  format?: (v: number) => string;
  rowName?: string;
  colName?: string;
}

/* Bimatrix display: row player's payoff first (Platform A colour), column player's second (B colour).
   Best responses are underlined in the player's colour; Nash equilibria get a ring. */
export default function PayoffMatrix({
  rowLabels, colLabels, A, B, brRow, brCol, nash = [], eliminatedRows, eliminatedCols, digits = 0, cellTitle,
  editable, onEdit, format, rowName = "Row player (A)", colName = "Column player (B)",
}: MatrixProps) {
  const f = format ?? ((v: number) => fmt(v, digits));
  const { c } = useTheme();
  const isNE = (i: number, j: number) => nash.some(([a, b]) => a === i && b === j);
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate" style={{ borderSpacing: 4 }}>
        <thead>
          <tr>
            <th />
            <th colSpan={colLabels.length} className="pb-1 text-center text-xs font-medium" style={{ color: c.text2 }}>
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: c.B }} />{colName}
            </th>
          </tr>
          <tr>
            <th className="pr-2 text-right text-xs font-medium text-ink2">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: c.A }} />{rowName}
            </th>
            {colLabels.map((l) => (
              <th key={l} className={clsx("px-2 text-center text-[13px] font-semibold transition", eliminatedCols?.has(l) ? "text-muted line-through opacity-50" : "text-ink")}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((rl, i) => (
            <tr key={rl}>
              <th className={clsx("pr-2 text-right text-[13px] font-semibold transition", eliminatedRows?.has(rl) ? "text-muted line-through opacity-50" : "text-ink")}>{rl}</th>
              {colLabels.map((cl, j) => {
                const dead = eliminatedRows?.has(rl) || eliminatedCols?.has(cl);
                const ne = isNE(i, j);
                return (
                  <motion.td key={cl} layout title={cellTitle?.(i, j)}
                    animate={{ opacity: dead ? 0.28 : 1 }}
                    className={clsx("relative min-w-[118px] rounded-lg border px-3 py-2.5 text-center transition",
                      ne ? "border-transparent" : "border-line", "bg-surface")}
                    style={ne ? { boxShadow: `0 0 0 2px ${c.text}` } : undefined}>
                    {ne && <span className="absolute -top-2 right-1.5 rounded bg-ink px-1 text-[10px] font-bold text-panel">NE</span>}
                    {editable ? (
                      <div className="flex items-center justify-center gap-1">
                        <input type="number" value={A[i][j]} onChange={(e) => onEdit?.("A", i, j, parseFloat(e.target.value) || 0)}
                          className="num w-14 rounded border border-line bg-panel px-1 text-center text-sm text-ink" style={{ borderBottom: `2px solid ${c.A}` }} />
                        <span className="text-muted">,</span>
                        <input type="number" value={B[i][j]} onChange={(e) => onEdit?.("B", i, j, parseFloat(e.target.value) || 0)}
                          className="num w-14 rounded border border-line bg-panel px-1 text-center text-sm text-ink" style={{ borderBottom: `2px solid ${c.B}` }} />
                      </div>
                    ) : (
                      <div className="num text-[14px] text-ink">
                        <span className={clsx(brRow?.[i]?.[j] && "font-bold")}
                          style={brRow?.[i]?.[j] ? { borderBottom: `2.5px solid ${c.A}` } : undefined}>{f(A[i][j])}</span>
                        <span className="mx-1 text-muted">,</span>
                        <span className={clsx(brCol?.[i]?.[j] && "font-bold")}
                          style={brCol?.[i]?.[j] ? { borderBottom: `2.5px solid ${c.B}` } : undefined}>{f(B[i][j])}</span>
                      </div>
                    )}
                    {editable && (brRow?.[i]?.[j] || brCol?.[i]?.[j]) && (
                      <div className="mt-1 flex justify-center gap-1 text-[10px]">
                        {brRow?.[i]?.[j] && <span style={{ color: c.text2 }}><span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.A }} />BR</span>}
                        {brCol?.[i]?.[j] && <span style={{ color: c.text2 }}><span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.B }} />BR</span>}
                      </div>
                    )}
                  </motion.td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
