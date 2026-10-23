export const fmt = (x: number | null | undefined, digits = 1): string =>
  x === null || x === undefined || Number.isNaN(x)
    ? "–"
    : x.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmt0 = (x: number | null | undefined) => fmt(x, 0);

export const inr = (x: number | null | undefined, digits = 0): string =>
  x === null || x === undefined || Number.isNaN(x) ? "–" : `${x < 0 ? "−" : ""}₹${fmt(Math.abs(x), digits)}`;

export const pct = (x: number | null | undefined, digits = 1): string =>
  x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;

export const compact = (x: number): string => {
  const a = Math.abs(x);
  if (a >= 1e5) return `${(x / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return x.toFixed(a < 10 ? 1 : 0);
};
