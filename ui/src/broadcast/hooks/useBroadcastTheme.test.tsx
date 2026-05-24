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

describe("useBroadcastTheme", () => {
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

  it("does not apply broadcast theme when neither flag is set", () => {
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("applies broadcast theme when ?broadcast=1 is in URL", () => {
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });

  it("applies broadcast theme when localStorage.paperclip_broadcast is '1'", () => {
    localStorage.setItem("paperclip_broadcast", "1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });

  it("persists flag from URL to localStorage", () => {
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(localStorage.getItem("paperclip_broadcast")).toBe("1");
  });
});
