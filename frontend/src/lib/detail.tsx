import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* One app-wide switch: "basic" view by default; technical extras appear only when it is on. */
interface DetailCtx {
  detail: boolean;
  setDetail: (on: boolean) => void;
}

const Ctx = createContext<DetailCtx>({ detail: false, setDetail: () => undefined });

export function DetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState(() => {
    try {
      return localStorage.getItem("rrr-detail") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("rrr-detail", detail ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [detail]);
  return <Ctx.Provider value={{ detail, setDetail }}>{children}</Ctx.Provider>;
}

export function useDetail() {
  return useContext(Ctx);
}

/** Renders its children only in "technical details" mode. */
export function Advanced({ children }: { children: ReactNode }) {
  const { detail } = useDetail();
  return detail ? <>{children}</> : null;
}

/** Renders its children only in the basic view. */
export function BasicOnly({ children }: { children: ReactNode }) {
  const { detail } = useDetail();
  return detail ? null : <>{children}</>;
}
