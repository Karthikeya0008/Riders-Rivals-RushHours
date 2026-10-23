import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, BookOpen, Bike, Crown, Eye, Gauge, Grid3x3, Lightbulb, Menu, Moon, Repeat, SlidersHorizontal, Sun, X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useDetail } from "../lib/detail";
import { useParams } from "../lib/params";
import { Toggle } from "./ui";
import { useTheme } from "../lib/theme";

export const NAV = [
  { to: "/", label: "Overview", icon: BookOpen },
  { to: "/playground", label: "Model Playground", icon: SlidersHorizontal },
  { to: "/comparison", label: "Model Comparison", icon: BarChart3 },
  { to: "/strategic", label: "Strategic Form Lab", icon: Grid3x3 },
  { to: "/leader-follower", label: "Leader–Follower", icon: Crown },
  { to: "/repeated", label: "Repeated Game Lab", icon: Repeat },
  { to: "/bayesian", label: "Incomplete Information", icon: Eye },
  { to: "/simulation", label: "City Simulation", icon: Bike },
  { to: "/sensitivity", label: "Sensitivity Analysis", icon: Gauge },
  { to: "/methodology", label: "Methodology", icon: BookOpen },
  { to: "/insights", label: "Insights", icon: Lightbulb },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <circle cx="12" cy="16" r="7" fill="rgb(var(--pa))" />
        <circle cx="20" cy="16" r="7" fill="rgb(var(--pb))" fillOpacity="0.85" />
      </svg>
      <div className="leading-tight">
        <div className="font-serif text-[15px] font-semibold text-ink">Riders, Rivals</div>
        <div className="font-serif text-[15px] font-semibold text-ink">&amp; Rush Hours</div>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="mt-6 space-y-0.5">
      {NAV.map(({ to, label, icon: Icon }, i) => (
        <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
          className={({ isActive }) => clsx(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition",
            isActive ? "bg-accent/10 font-semibold text-accent" : "text-ink2 hover:bg-line/50 hover:text-ink")}>
          <Icon size={16} strokeWidth={1.8} />
          <span className="flex-1">{label}</span>
          <span className="num text-[11px] text-muted">{i + 1}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Footer() {
  const { dark, toggle } = useTheme();
  const { overrides, reset, configError, config } = useParams();
  const { detail, setDetail } = useDetail();
  const n = Object.keys(overrides).length;
  return (
    <div className="mt-auto space-y-2 pt-6">
      <div className="rounded-lg border border-line bg-surface px-2.5 py-2">
        <Toggle checked={detail} onChange={setDetail} label="Show technical details" />
        <p className="mt-1 text-[11px] leading-snug text-muted">
          {detail ? "Showing solver checks, extra sliders and extra charts." : "Basic view: only the main results are shown."}
        </p>
      </div>
      {n > 0 && (
        <div className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-ink2">
          {n} parameter{n > 1 ? "s" : ""} changed from defaults.{" "}
          <button className="font-semibold text-accent hover:underline" onClick={reset}>Reset</button>
        </div>
      )}
      <div className="flex items-center justify-between px-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={clsx("h-2 w-2 rounded-full", config ? "bg-[#0ca30c]" : configError ? "bg-[#d03b3b]" : "bg-[#fab219]")} />
          {config ? "Engine connected" : configError ? "Engine offline" : "Connecting…"}
        </span>
        <button className="btn-icon" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-panel lg:block">
        <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-3 py-5">
          <Brand />
          <NavList />
          <Footer />
        </div>
      </aside>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-panel/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <button className="btn-icon" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={18} /></button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.aside className="flex h-full w-72 flex-col overflow-y-auto bg-panel px-3 py-5" initial={{ x: -300 }}
              animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "tween", duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between"><Brand />
                <button className="btn-icon" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
              <NavList onNavigate={() => setOpen(false)} />
              <Footer />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <main className="min-w-0 flex-1">
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </motion.div>
      </main>
    </div>
  );
}
