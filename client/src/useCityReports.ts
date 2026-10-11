import { useCallback, useEffect, useRef, useState } from "react";
import type { CityReviewData } from "./cityReviewData";
import type { Incident } from "./types";

interface Snapshot {
  sourceKey: string;
  incidents: Incident[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  updatedAt?: Date;
  version: number;
}
const empty = (sourceKey: string): Snapshot => ({ sourceKey, incidents: [], loading: true, refreshing: false, error: "", version: 0 });

/** City-only polling. Retain last good data; abort obsolete reads; pause hidden tabs. */
export function useCityReports(data: CityReviewData, includeDemo: boolean) {
  const sourceKey = `${data.mode}:${includeDemo}`;
  const [snapshot, setSnapshot] = useState(() => empty(sourceKey));
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    let inFlight = false;
    setSnapshot(empty(sourceKey));
    async function load(force = false) {
      if (disposed || (inFlight && !force)) return;
      controller?.abort();
      const current = new AbortController(); controller = current; inFlight = true;
      setSnapshot(previous => ({ ...previous, refreshing: true }));
      try {
        const signal = AbortSignal.any([current.signal, AbortSignal.timeout(15000)]);
        const incidents = await data.listIncidents({ demo: data.mode === "fixtures" ? true : includeDemo ? undefined : false }, signal);
        if (disposed || current.signal.aborted) return;
        setSnapshot(previous => ({ sourceKey, incidents, loading: false, refreshing: false, error: "", updatedAt: new Date(), version: previous.version + 1 }));
      } catch (reason) {
        if (disposed || current.signal.aborted) return;
        setSnapshot(previous => ({ ...previous, loading: false, refreshing: false, error: reason instanceof Error ? reason.message : "Reports could not be refreshed." }));
      } finally {
        if (controller === current) inFlight = false;
      }
    }
    reload.current = () => void load(true);
    void load();
    const poll = () => { if (data.mode === "live" && !document.hidden) void load(); };
    const interval = window.setInterval(poll, 30000);
    const onVisibility = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { disposed = true; controller?.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, [data, includeDemo, sourceKey]);
  const refresh = useCallback(() => reload.current(), []);
  return { ...(snapshot.sourceKey === sourceKey ? snapshot : empty(sourceKey)), refresh };
}
