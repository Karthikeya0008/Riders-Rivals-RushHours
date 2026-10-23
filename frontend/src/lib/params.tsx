import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get } from "./api";
import type { AppConfig } from "./types";

/* Global parameter overrides shared by every page, so a change on the Playground carries over
   to the comparison, the labs and the simulation. Only differences from the defaults are sent. */
interface ParamsCtx {
  config: AppConfig | null;
  configError: string | null;
  market: Record<string, number>;
  overrides: Record<string, number>;
  setParam: (key: string, value: number) => void;
  reset: () => void;
  dominant: boolean;
  setDominant: (on: boolean) => void;
  params: { market: Record<string, number> } | null;
  scenario: string;
  setScenario: (s: string) => void;
}

const Ctx = createContext<ParamsCtx | null>(null);

function load(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function ParamsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(load("rrr-overrides", "{}"));
    } catch {
      return {};
    }
  });
  const [scenario, setScenarioState] = useState(() => load("rrr-scenario", "Peak"));

  useEffect(() => {
    let alive = true;
    const attempt = (n: number) =>
      get<AppConfig>("/config")
        .then((c) => alive && (setConfig(c), setConfigError(null)))
        .catch((e: Error) => {
          if (!alive) return;
          setConfigError(e.message);
          if (n < 40) setTimeout(() => attempt(n + 1), 1500);
        });
    attempt(0);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("rrr-overrides", JSON.stringify(overrides));
      localStorage.setItem("rrr-scenario", scenario);
    } catch {
      /* storage unavailable */
    }
  }, [overrides, scenario]);

  const defaults = useMemo(() => {
    const m: Record<string, number> = {};
    if (config) for (const [k, v] of Object.entries(config.defaults.market)) if (typeof v === "number") m[k] = v;
    return m;
  }, [config]);

  const setParam = useCallback(
    (key: string, value: number) =>
      setOverrides((o) => {
        const next = { ...o };
        if (Math.abs((defaults[key] ?? NaN) - value) < 1e-12) delete next[key];
        else next[key] = value;
        return next;
      }),
    [defaults],
  );

  const market = useMemo(() => ({ ...defaults, ...overrides }), [defaults, overrides]);
  const dominant = market.a_A !== undefined && market.a_A > market.a_B + 1e-9;
  const setDominant = useCallback(
    (on: boolean) => setParam("a_A", on ? (market.a_B ?? 4) + (defaults.dominant_bonus ?? 0.2) : market.a_B ?? 4),
    [setParam, market.a_B, defaults.dominant_bonus],
  );

  const value = useMemo<ParamsCtx>(
    () => ({
      config,
      configError,
      market,
      overrides,
      setParam,
      reset: () => setOverrides({}),
      dominant,
      setDominant,
      params: Object.keys(overrides).length ? { market: overrides } : null,
      scenario,
      setScenario: setScenarioState,
    }),
    [config, configError, market, overrides, setParam, dominant, setDominant, scenario],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useParams() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ParamsProvider missing");
  return v;
}
