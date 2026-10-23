import { useEffect, useRef, useState } from "react";

const inflight = new Map<string, Promise<unknown>>();
const results = new Map<string, unknown>();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const key = path + "|" + JSON.stringify(body);
  if (results.has(key)) return results.get(key) as T;
  if (!inflight.has(key)) {
    const p = fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (!r.ok) {
          let detail = r.statusText;
          try {
            const j = await r.json();
            detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
          } catch {
            /* non-JSON error body */
          }
          throw new ApiError(detail || `HTTP ${r.status}`, r.status);
        }
        return r.json();
      })
      .then((data) => {
        results.set(key, data);
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key) as Promise<T>;
}

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`);
  if (!r.ok) throw new ApiError(r.statusText, r.status);
  return r.json();
}

export async function downloadCsvFromApi(kind: string, params: unknown, options: unknown, filename: string) {
  const r = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, params, options }),
  });
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** POST `body` to `path` whenever the serialised body changes (debounced). Keeps the last data while reloading. */
export function useApi<T>(path: string | null, body: unknown, debounceMs = 250): ApiState<T> {
  const key = path ? path + "|" + JSON.stringify(body) : null;
  const [state, setState] = useState<ApiState<T>>(() => ({
    data: key && results.has(key) ? (results.get(key) as T) : null,
    loading: !!key && !results.has(key),
    error: null,
  }));
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
    if (!key || !path) return;
    if (results.has(key)) {
      setState({ data: results.get(key) as T, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(() => {
      post<T>(path, body)
        .then((data) => {
          if (latest.current === key) setState({ data, loading: false, error: null });
        })
        .catch((e: Error) => {
          if (latest.current === key) setState((s) => ({ ...s, loading: false, error: e.message }));
        });
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
