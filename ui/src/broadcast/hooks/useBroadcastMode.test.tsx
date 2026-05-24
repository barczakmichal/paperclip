// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBroadcastMode } from "./useBroadcastMode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let probeReturn: { mode: string; toggle: () => void } | null = null;
function Probe() {
  probeReturn = useBroadcastMode();
  return null;
}

describe("useBroadcastMode", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement("div"); document.body.appendChild(container);
    localStorage.clear();
    probeReturn = null;
  });
  afterEach(() => { container.remove(); localStorage.clear(); });

  it("defaults to 'full' mode", () => {
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(probeReturn?.mode).toBe("full");
    act(() => { root.unmount(); });
  });

  it("toggle switches to 'hero' and persists to localStorage", () => {
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    act(() => { probeReturn?.toggle(); });
    expect(probeReturn?.mode).toBe("hero");
    expect(localStorage.getItem("paperclip_broadcast_mode")).toBe("hero");
    act(() => { root.unmount(); });
  });

  it("reads initial value from localStorage", () => {
    localStorage.setItem("paperclip_broadcast_mode", "hero");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(probeReturn?.mode).toBe("hero");
    act(() => { root.unmount(); });
  });
});
