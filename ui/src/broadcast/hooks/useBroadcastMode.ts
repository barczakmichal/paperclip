import { useCallback, useEffect, useState } from "react";

export type BroadcastMode = "full" | "hero";

const STORAGE_KEY = "paperclip_broadcast_mode";

export function useBroadcastMode(): { mode: BroadcastMode; toggle: () => void } {
  const [mode, setMode] = useState<BroadcastMode>(() => {
    if (typeof window === "undefined") return "full";
    return localStorage.getItem(STORAGE_KEY) === "hero" ? "hero" : "full";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((m) => (m === "full" ? "hero" : "full"));
  }, []);

  return { mode, toggle };
}
