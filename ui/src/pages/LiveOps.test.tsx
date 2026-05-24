// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveOpsPage } from "./LiveOps";

vi.mock("@/api/liveOps", () => ({
  liveOpsApi: {
    liveAgentsForCompany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/api/approvals", () => ({
  approvalsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "c1",
    selectedCompany: { id: "c1", name: "Test Co", issuePrefix: "TC", brandColor: null },
    companies: [],
    loading: false,
  }),
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => () => {},
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveOpsPage", () => {
  let c: HTMLDivElement;
  beforeEach(() => {
    c = document.createElement("div");
    document.body.appendChild(c);
  });
  afterEach(() => {
    c.remove();
  });

  it("renders the Live Ops header", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(c);
    act(() => {
      root.render(
        <QueryClientProvider client={qc}>
          <LiveOpsPage />
        </QueryClientProvider>,
      );
    });
    expect(c.textContent).toMatch(/Live Ops/i);
    act(() => {
      root.unmount();
    });
  });
});
