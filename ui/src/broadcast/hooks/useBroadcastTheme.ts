import { useEffect } from "react";

const STORAGE_KEY = "paperclip_broadcast";
const URL_PARAM = "broadcast";

function readEffectiveEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  const urlFlag = url.searchParams.get(URL_PARAM);
  if (urlFlag === "1") return true;
  if (urlFlag === "0") return false;

  // No URL override: consult localStorage
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "0") return false;

  // Default: ON (broadcast is default in Faza A2+)
  return true;
}

function persistFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const urlFlag = url.searchParams.get(URL_PARAM);
  if (urlFlag === "1" || urlFlag === "0") {
    window.localStorage.setItem(STORAGE_KEY, urlFlag);
  }
}

export function useBroadcastTheme(): void {
  useEffect(() => {
    persistFromUrl();
    if (readEffectiveEnabled()) {
      document.documentElement.setAttribute("data-theme", "broadcast");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);
}
