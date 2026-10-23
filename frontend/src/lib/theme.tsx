import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/* Validated categorical palette (fixed order, never cycled). Slot 1 = Platform A, slot 2 = Platform B. */
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
/* Sequential blue ramp (100 -> 700) for magnitude (heatmaps). */
export const SEQ_BLUE = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

export interface ChartColors {
  dark: boolean;
  series: string[];
  A: string;
  B: string;
  text: string;
  text2: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  good: string;
  critical: string;
  neutral: string;
}

function colors(dark: boolean): ChartColors {
  const series = dark ? SERIES_DARK : SERIES_LIGHT;
  return {
    dark,
    series,
    A: series[0],
    B: series[1],
    text: dark ? "#f0efec" : "#0b0b0b",
    text2: dark ? "#c3c2b7" : "#52514e",
    muted: dark ? "#8f8e86" : "#807f79",
    grid: dark ? "#2e2e2b" : "#e9e8e4",
    axis: dark ? "#4a4a46" : "#cfcec9",
    surface: dark ? "#1a1a19" : "#fcfcfb",
    good: "#0ca30c",
    critical: "#d03b3b",
    neutral: dark ? "#6f6e68" : "#a3a29c",
  };
}

interface ThemeCtx {
  dark: boolean;
  toggle: () => void;
  c: ChartColors;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("rrr-theme", dark ? "dark" : "light");
    } catch {
      /* storage unavailable: theme still works for this session */
    }
  }, [dark]);
  const toggle = useCallback(() => setDark((d) => !d), []);
  const value = useMemo(() => ({ dark, toggle, c: colors(dark) }), [dark, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}

export function seqColor(t: number): string {
  const i = Math.max(0, Math.min(SEQ_BLUE.length - 1, Math.round(t * (SEQ_BLUE.length - 1))));
  return SEQ_BLUE[i];
}

/* Fixed model -> categorical slot mapping so a model keeps its colour on every page. */
export const MODEL_SLOT: Record<string, number> = {
  cournot: 0,
  bertrand_incentive: 1,
  bertrand_fee: 2,
  stackelberg_capacity: 3,
  stackelberg_incentive: 4,
  two_stage: 5,
  collusion: 6,
  planner: 7,
  bertrand_homogeneous: 1,
};
