import { useEffect } from "react";

const STORAGE_KEY = "paperclip_broadcast";
const URL_PARAM = "broadcast";

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(URL_PARAM) === "1") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function persistFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(URL_PARAM) === "1") {
    window.localStorage.setItem(STORAGE_KEY, "1");
  }
}

export function useBroadcastTheme(): void {
  useEffect(() => {
    persistFromUrl();
    if (readEnabled()) {
      document.documentElement.setAttribute("data-theme", "broadcast");
    }
  }, []);
}
