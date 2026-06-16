// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBroadcastTheme } from "./useBroadcastTheme";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useBroadcastTheme();
  return null;
}

describe("useBroadcastTheme (default-on)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    container.remove();
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("applies broadcast theme by default (no flag set)", () => {
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
    act(() => { root.unmount(); });
  });

  it("does NOT apply broadcast when ?broadcast=0 in URL", () => {
    window.history.replaceState({}, "", "/?broadcast=0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    act(() => { root.unmount(); });
  });

  it("does NOT apply broadcast when localStorage.paperclip_broadcast='0'", () => {
    localStorage.setItem("paperclip_broadcast", "0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    act(() => { root.unmount(); });
  });

  it("?broadcast=1 in URL re-enables broadcast even if localStorage said 0", () => {
    localStorage.setItem("paperclip_broadcast", "0");
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
    act(() => { root.unmount(); });
  });

  it("?broadcast=1 in URL persists '1' to localStorage", () => {
    localStorage.setItem("paperclip_broadcast", "0");
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(localStorage.getItem("paperclip_broadcast")).toBe("1");
    act(() => { root.unmount(); });
  });

  it("?broadcast=0 in URL persists '0' to localStorage", () => {
    window.history.replaceState({}, "", "/?broadcast=0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(localStorage.getItem("paperclip_broadcast")).toBe("0");
    act(() => { root.unmount(); });
  });

  it("localStorage.paperclip_broadcast='1' applies broadcast (forward compat)", () => {
    localStorage.setItem("paperclip_broadcast", "1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
    act(() => { root.unmount(); });
  });

  it("invalid localStorage value treated as default-on", () => {
    localStorage.setItem("paperclip_broadcast", "garbage");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
    act(() => { root.unmount(); });
  });
});
