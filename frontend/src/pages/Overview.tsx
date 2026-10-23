import { ArrowRight, Network, ShieldOff, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, Section, Stat } from "../components/ui";
import { useApi } from "../lib/api";
import { fmt, inr } from "../lib/format";
import { useParams } from "../lib/params";
import { useTheme } from "../lib/theme";
import type { CompareResult } from "../lib/types";

function MarketDiagram() {
  const { c } = useTheme();
  const box = (x: number, y: number, w: number, h: number, fill: string, stroke: string) => (
    <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
  );
  const t = (x: number, y: number, s: string, opts: { size?: number; weight?: number; color?: string; anchor?: "start" | "middle" | "end" } = {}) => (
    <text x={x} y={y} textAnchor={opts.anchor ?? "middle"} fontSize={opts.size ?? 13} fontWeight={opts.weight ?? 500}
      fill={opts.color ?? c.text} fontFamily="Inter, system-ui, sans-serif">{s}</text>
  );
  const panel = c.dark ? "#232322" : "#ffffff";
  const arrow = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
  return (
    <svg viewBox="0 0 860 400" className="h-auto w-full" role="img"
      aria-label="Two-sided market: customers choose between Platform A, Platform B or not ordering; a shared pool of multi-homing riders chooses between A, B or going offline.">
      <defs>{arrow("ah", c.muted)}{arrow("aa", c.A)}{arrow("ab", c.B)}</defs>
      {/* customers */}
      {box(20, 120, 200, 160, panel, c.axis)}
      {t(120, 152, "Customers", { size: 15, weight: 600 })}
      {t(120, 176, "Λ orders / hour arrive", { size: 12, color: c.text2 })}
      {t(120, 200, "choose A, B or no order", { size: 12, color: c.text2 })}
      {t(120, 222, "logit on fee p and delay D", { size: 12, color: c.text2 })}
      {t(120, 258, "outside option: don't order", { size: 11, color: c.muted })}
      {/* platforms */}
      {box(330, 40, 200, 130, panel, c.A)}
      <circle cx={352} cy={64} r={7} fill={c.A} />
      {t(445, 70, "Platform A", { size: 15, weight: 600 })}
      {t(430, 98, "sets w_A, p_A or N_A", { size: 12, color: c.text2 })}
      {t(430, 120, "μ_A = k·N_A riders' capacity", { size: 12, color: c.text2 })}
      {t(430, 142, "delay D_A = d0 + s·ρ/(1−ρ)", { size: 12, color: c.text2 })}
      {box(330, 230, 200, 130, panel, c.B)}
      <circle cx={352} cy={254} r={7} fill={c.B} />
      {t(445, 260, "Platform B", { size: 15, weight: 600 })}
      {t(430, 288, "sets w_B, p_B or N_B", { size: 12, color: c.text2 })}
      {t(430, 310, "μ_B = k·N_B riders' capacity", { size: 12, color: c.text2 })}
      {t(430, 332, "delay D_B = d0 + s·ρ/(1−ρ)", { size: 12, color: c.text2 })}
      {/* rider pool */}
      {box(640, 120, 200, 160, panel, c.axis)}
      {t(740, 152, "Shared rider pool", { size: 15, weight: 600 })}
      {t(740, 176, "R multi-homing riders", { size: 12, color: c.text2 })}
      {t(740, 200, "choose A, B or offline", { size: 12, color: c.text2 })}
      {t(740, 222, "logit on incentive w", { size: 12, color: c.text2 })}
      {t(740, 258, "outside option: w0 per order", { size: 11, color: c.muted })}
      {/* flows customers -> platforms */}
      <path d="M220,170 C270,150 290,110 328,105" fill="none" stroke={c.A} strokeWidth={2} markerEnd="url(#aa)" />
      <path d="M220,230 C270,250 290,290 328,295" fill="none" stroke={c.B} strokeWidth={2} markerEnd="url(#ab)" />
      {t(262, 122, "λ_A, pays p_A", { size: 11, color: c.text2 })}
      {t(262, 292, "λ_B, pays p_B", { size: 11, color: c.text2 })}
      {/* flows riders -> platforms */}
      <path d="M640,170 C590,150 570,110 532,105" fill="none" stroke={c.A} strokeWidth={2} markerEnd="url(#aa)" />
      <path d="M640,230 C590,250 570,290 532,295" fill="none" stroke={c.B} strokeWidth={2} markerEnd="url(#ab)" />
      {t(598, 122, "N_A, earns w_A", { size: 11, color: c.text2 })}
      {t(598, 292, "N_B, earns w_B", { size: 11, color: c.text2 })}
      {/* rivalry */}
      <path d="M430,172 L430,228" stroke={c.muted} strokeWidth={1.5} strokeDasharray="4 4" markerEnd="url(#ah)" markerStart="url(#ah)" />
      {t(436, 205, "compete for the same riders and customers", { size: 11, color: c.muted, anchor: "start" })}
      {t(430, 392, "Restaurants pay commission m per completed order: profit π_i = completed_i · (p_i + m − w_i)", { size: 11.5, color: c.muted })}
    </svg>
  );
}

export default function Overview() {
  const { params } = useParams();
  const { data } = useApi<CompareResult>("/compare", { params });
  const row = (m: string, s: string) => data?.rows.find((r) => r.model === m && r.scenario === s);
  const b = row("bertrand_incentive", "Extreme"), col = row("collusion", "Extreme");

  return (
    <div>
      <PageHeader kicker="A game-theoretic analysis of incentive and capacity competition between food delivery platforms"
        title="Riders, Rivals and Rush Hours" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="card card-pad prose-body space-y-3">
          <div className="label">Problem statement</div>
          <p>
            During lunch and dinner peaks, competing delivery platforms (Platform A and Platform B, motivated by Swiggy and Zomato)
            serve the same customers and draw on an overlapping pool of multi-homing riders. When one platform raises rider
            incentives, riders shift away from the rival, so each platform's delays, completed orders and costs depend on the
            other's choices.
          </p>
          <p>
            Platforms that optimise in isolation fall into costly incentive wars that raise expenditure without proportionally
            reducing delays. This project models these decisions as strategic games and compares outcomes under different
            competitive structures and demand levels.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Game models" value="9" sub="+ planner & collusion benchmarks" />
          <Stat label="Demand scenarios" value="4" sub="600 – 2,000 orders/h" />
          <Stat label="Verified equilibria" value={data ? `${data.rows.filter((r) => r.verified).length}/${data.rows.length}` : "…"} sub="no profitable unilateral deviation" />
          <Stat label="Incentive war at peak" value={b && col ? `+${inr(b.total_incentive_spend - col.total_incentive_spend)}` : "…"}
            sub={b && col ? `spend for ${fmt(col.avg_delay - b.avg_delay)} min less delay` : "vs incentive cartel"} />
        </div>
      </div>

      <Section title="The two-sided market every model shares">
        <div className="card card-pad">
          <MarketDiagram />
          <p className="mt-2 text-[13px] text-ink2">
            One <b>MarketEnvironment</b> defines rider supply, capacity, delay, customer demand and profit. Every game model uses it unchanged.
            Only <i>who chooses what, and when</i> differs, so comparisons across models are like-for-like.
          </p>
        </div>
      </Section>

      <Section title="How to explore this app in 5 minutes">
        <div className="card card-pad">
          <ol className="list-decimal space-y-2 pl-5 text-[14.5px] leading-relaxed text-ink2">
            <li><b className="text-ink">Model Playground:</b> pick “Bertrand: incentives” and Peak demand. See where the two
              best-response lines cross: that is the equilibrium.</li>
            <li><b className="text-ink">Model Comparison:</b> compare delivery time and rider pay across all models. Notice how much
              more the incentive war costs for only a small cut in delay.</li>
            <li><b className="text-ink">Strategic Form Lab:</b> press <i>Animate</i> to watch bad choices get crossed out until only
              (High, High) is left: a Prisoner's Dilemma.</li>
            <li><b className="text-ink">Repeated Game Lab:</b> move the δ slider below and above the red line to see when the
              “let's both pay low” truce survives.</li>
            <li><b className="text-ink">City Simulation:</b> press Play and watch riders run out at the peak.</li>
            <li><b className="text-ink">Insights:</b> the main conclusions in plain sentences.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">Want the solver details? Turn on “Show technical details” in the sidebar.</p>
        </div>
      </Section>

      <Section title="Why game theory?">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Network, title: "Interdependent payoffs", text: "A's delay depends on how many riders B attracts, and B's orders depend on A's delay. No platform can compute its profit without predicting the rival's choice." },
            { icon: ShieldOff, title: "No central planner", text: "Each platform maximises its own profit. The outcome is an equilibrium of strategic choices, not an optimum. The planner benchmark measures the gap (price of anarchy)." },
            { icon: Swords, title: "Strategy and timing matter", text: "Choosing capacity vs incentives vs fees, simultaneously or as leader and follower, once or repeatedly every day, and with private demand information, changes the outcome." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="card card-pad">
              <Icon size={20} className="text-accent" />
              <div className="mt-2 font-semibold text-ink">{title}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-ink2">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Research questions">
        <div className="card card-pad">
          <ol className="list-decimal space-y-2 pl-5 text-[14.5px] leading-relaxed text-ink2">
            <li>Does incentive competition reduce delivery delays, or does it mainly transfer surplus from platforms to riders?</li>
            <li>How do outcomes differ when platforms compete in capacity (Cournot), incentives or fees (Bertrand), or capacity-then-fees?</li>
            <li>When does moving first help a platform, and does the follower gain or lose?</li>
            <li>How patient must platforms be to sustain a low-incentive truce, and how fragile is it when moves are observed with noise?</li>
            <li>How do private demand shocks change capacity choices, and how close do competitive outcomes come to the social optimum across demand levels?</li>
          </ol>
        </div>
      </Section>

      <Section title="Explore">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["/playground", "Model Playground", "Solve any model, move the sliders, see best-response curves."],
            ["/comparison", "Model Comparison", "All models × all demand levels, with an efficiency heatmap."],
            ["/strategic", "Strategic Form Lab", "Payoff matrix, dominance elimination, mixed NE, Prisoner's Dilemma."],
            ["/repeated", "Repeated Game Lab", "δ*, strategy tournament, noisy monitoring."],
            ["/simulation", "City Simulation", "Watch riders and orders; validate the delay function."],
            ["/insights", "Insights", "Auto-generated key findings."],
          ].map(([to, title, text]) => (
            <Link key={to} to={to} className="card card-pad group transition hover:border-accent/50">
              <div className="flex items-center justify-between font-semibold text-ink">{title}<ArrowRight size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" /></div>
              <p className="mt-1 text-[13px] text-ink2">{text}</p>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
