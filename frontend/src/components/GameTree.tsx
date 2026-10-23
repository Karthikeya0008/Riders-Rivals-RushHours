import { fmt } from "../lib/format";
import { useTheme } from "../lib/theme";

export interface TreeBranch {
  edge: string;      // label on the first-stage edge (leader's action)
  response: string;  // label of the second mover's reaction
  payoff: [number, number];
  chosen: boolean;
}

/* Two-level game tree. `step` controls the backward-induction reveal:
   0 = tree only, 1 = second mover's responses, 2 = first mover compares payoffs, 3 = equilibrium path. */
export default function GameTree({ root, second, branches, step }: {
  root: string; second: string; branches: TreeBranch[]; step: number;
}) {
  const { c } = useTheme();
  const n = branches.length;
  const W = Math.max(640, n * 150);
  const H = 330;
  const rootX = W / 2, rootY = 36;
  const midY = 150, leafY = 250;
  const x = (i: number) => (W / n) * (i + 0.5);
  const best = branches.reduce((m, b, i) => (b.payoff[0] > branches[m].payoff[0] ? i : m), 0);
  const font = "Inter, system-ui, sans-serif";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Game tree solved by backward induction">
      <circle cx={rootX} cy={rootY} r={18} fill={c.A} />
      <text x={rootX} y={rootY + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" fontFamily={font}>A</text>
      <text x={rootX + 28} y={rootY + 4} fontSize={12} fill={c.text2} fontFamily={font}>{root}</text>
      {branches.map((b, i) => {
        const onPath = step >= 3 && b.chosen;
        const stroke = onPath ? c.text : c.axis;
        return (
          <g key={i}>
            <line x1={rootX} y1={rootY + 18} x2={x(i)} y2={midY - 16} stroke={stroke} strokeWidth={onPath ? 3 : 1.5} />
            <text x={(rootX + x(i)) / 2 + (x(i) < rootX ? -6 : 6)} y={(rootY + midY) / 2 + 4} textAnchor={x(i) < rootX ? "end" : "start"}
              fontSize={11.5} fill={c.text2} fontFamily={font}>{b.edge}</text>
            <circle cx={x(i)} cy={midY} r={15} fill={c.B} opacity={step >= 1 || step === 0 ? 1 : 0.5} />
            <text x={x(i)} y={midY + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff" fontFamily={font}>B</text>
            <line x1={x(i)} y1={midY + 15} x2={x(i)} y2={leafY - 22} stroke={step >= 1 ? (onPath ? c.text : c.B) : c.axis}
              strokeWidth={onPath ? 3 : step >= 1 ? 2 : 1.5} strokeDasharray={step >= 1 ? undefined : "4 4"} />
            {step >= 1 && <text x={x(i) + 6} y={(midY + leafY) / 2 + 2} fontSize={11} fill={c.text2} fontFamily={font}>{b.response}</text>}
            <rect x={x(i) - 62} y={leafY - 20} width={124} height={step >= 1 ? 54 : 30} rx={8}
              fill={c.surface} stroke={onPath ? c.text : step >= 2 && i === best ? c.A : c.axis} strokeWidth={onPath || (step >= 2 && i === best) ? 2 : 1} />
            {step >= 1 ? (
              <>
                <text x={x(i)} y={leafY} textAnchor="middle" fontSize={11} fill={c.muted} fontFamily={font}>payoffs (A, B)</text>
                <text x={x(i)} y={leafY + 22} textAnchor="middle" fontSize={13} fontFamily={font} fill={c.text}>
                  <tspan fontWeight={step >= 2 ? 700 : 500}>₹{fmt(b.payoff[0], 0)}</tspan>
                  <tspan fill={c.muted}>, </tspan>
                  <tspan>₹{fmt(b.payoff[1], 0)}</tspan>
                </text>
              </>
            ) : (
              <text x={x(i)} y={leafY} textAnchor="middle" fontSize={11} fill={c.muted} fontFamily={font}>{second}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
