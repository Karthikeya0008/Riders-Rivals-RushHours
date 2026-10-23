export type Pair = [number, number];

export interface Outcome {
  w: Pair;
  p: Pair;
  N: Pair;
  N0: number;
  mu: Pair;
  demand: Pair;
  completed: Pair;
  unserved: Pair;
  rho: Pair;
  delay: Pair;
  profit: Pair;
  incentive_spend: Pair;
  revenue: Pair;
  market_share: Pair;
  outside_share: number;
  consumer_surplus: number;
  cs_logsum: number;
  delay_cost: number;
  rider_surplus: number;
  orders_per_rider: number;
  total_profit: number;
  total_welfare: number;
  avg_delay: number;
  total_completed: number;
  total_unserved: number;
  total_incentive_spend: number;
  efficiency: number | null;
  price_of_anarchy: number | null;
  planner_welfare: number;
  fixed_point: { iterations: number; residual: number; converged: boolean; method: string };
}

export interface DeviationPlayer {
  player: string;
  type?: string;
  strategy: number;
  payoff: number;
  best_deviation: number;
  best_deviation_payoff: number;
  gain: number;
  tolerance: number;
  passed: boolean;
}

export interface Verification {
  passed: boolean;
  grid_points?: number;
  players?: DeviationPlayer[];
  kind?: string;
  gain?: number;
  tolerance?: number;
  leader?: { passed: boolean; gain: number; tolerance: number; best_grid_commitment: number; grid_points: number };
  stage1?: { passed: boolean; players: DeviationPlayer[] };
  stage2?: { passed: boolean; players: DeviationPlayer[] };
}

export interface XY {
  x: number;
  y: number;
}

export interface ModelResult {
  model: string;
  label: string;
  scenario: string;
  demand_rate: number;
  strategy_variable: { symbol: string; name: string; unit: string };
  equilibrium: { A: number; B: number };
  outcome: Outcome;
  verification: Verification;
  convergence: { converged?: boolean; iterations?: number; damping?: number; path?: Pair[] };
  br_curves: { A: XY[]; B: XY[] } | null;
  notes: string[];
  extras: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  info: { label: string; variable: string; timing: string; module: number };
}

export interface CompareRow {
  model: string;
  label: string;
  scenario: string;
  demand_rate: number;
  variable: string;
  strategy_A: number;
  strategy_B: number;
  verified: boolean;
  avg_delay: number;
  total_completed: number;
  total_profit: number;
  total_incentive_spend: number;
  efficiency: number;
  total_welfare: number;
  consumer_surplus: number;
  rider_surplus: number;
  total_unserved: number;
  price_of_anarchy: number;
  [k: string]: unknown;
}

export interface CompareResult {
  scenarios: string[];
  demand: Record<string, number>;
  models: { id: string; label: string; variable: string; timing: string }[];
  metrics: { key: string; label: string; unit: string }[];
  rows: CompareRow[];
  efficiency_heatmap: { models: string[]; scenarios: string[]; values: number[][] };
  all_verified: boolean;
}

export interface ParamMeta {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export interface AppConfig {
  defaults: {
    market: Record<string, number | string>;
    scenarios: Record<string, number>;
    simulation: Record<string, number | string | boolean>;
    repeated: Record<string, number>;
    bayesian: Record<string, number>;
  };
  param_meta: Record<string, ParamMeta>;
  scenarios: Record<string, number>;
  models: { id: string; label: string; variable: string; timing: string; module: number }[];
  comparison_models: string[];
  sensitivity_params: Record<string, { label: string; range: [number, number] }>;
}
