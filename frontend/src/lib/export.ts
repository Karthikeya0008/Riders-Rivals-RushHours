import { toPng } from "html-to-image";

export async function exportPng(node: HTMLElement | null, filename: string, background: string) {
  if (!node) return;
  const url = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: background,
    filter: (el) => !(el instanceof HTMLElement && el.dataset.noExport === "true"),
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys: string[] = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => !keys.includes(k) && keys.push(k)));
  return [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n");
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
