// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel, ChannelMessage, ChannelMemberStatus } from "@paperclipai/shared";
import { Channels } from "./Channels";

// ── mocks ────────────────────────────────────────────────────────────────────

const mockChannelsApi = vi.hoisted(() => ({
  list: vi.fn(),
  members: vi.fn(),
  messages: vi.fn(),
  post: vi.fn(),
}));

const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());

vi.mock("@/api/channels", () => ({
  channelsApi: mockChannelsApi,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "c1",
    selectedCompany: { id: "c1", name: "Test Co", issuePrefix: "TC", brandColor: null },
    companies: [],
    loading: false,
  }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  NavLink: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("../components/MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: string }) => <span>{children}</span>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── WebSocket mock ────────────────────────────────────────────────────────────
// jsdom does not provide WebSocket; stub a minimal implementation so the page
// mounts without throwing and so tests can simulate incoming messages.

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((ev: MessageEvent) => any) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((ev: Event) => any) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((ev: CloseEvent) => any) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((ev: Event) => any) | null = null;

  // Expose the last created instance so tests can call simulateMessage.
  static lastInstance: FakeWebSocket | null = null;

  constructor(public url: string) {
    super();
    FakeWebSocket.lastInstance = this;
  }

  simulateMessage(data: unknown) {
    const event = new MessageEvent("message", { data: JSON.stringify(data) });
    if (this.onmessage) this.onmessage(event);
  }

  close(code?: number, reason?: string) {
    void code;
    void reason;
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close"));
    }
  }

  send(_data: string) { /* no-op */ }
}

// Install before tests, restore after.
let originalWebSocket: typeof WebSocket;
beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  FakeWebSocket.lastInstance = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = FakeWebSocket;
});
afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = originalWebSocket;
});

// ── fixtures ─────────────────────────────────────────────────────────────────

const CHANNEL: Channel = {
  id: "ch1",
  companyId: "c1",
  key: "marketing",
  name: "marketing",
  kind: "department",
  managerAgentId: null,
  backingIssueId: null,
  archivedAt: null,
};

const MESSAGE: ChannelMessage = {
  id: "msg1",
  channelId: "ch1",
  kind: "message",
  body: "Hello from user",
  authorUserId: "u1",
  authorAgentId: null,
  mentionedAgentIds: [],
  triggeredRunId: null,
  createdAt: new Date("2026-01-01T12:00:00Z").toISOString(),
};

const AGENT_REPLY: ChannelMessage = {
  id: "msg2",
  channelId: "ch1",
  kind: "agent_reply",
  body: "Reply from agent",
  authorUserId: null,
  authorAgentId: "a1",
  mentionedAgentIds: [],
  triggeredRunId: null,
  createdAt: new Date("2026-01-01T12:01:00Z").toISOString(),
};

const MEMBER: ChannelMemberStatus = {
  agentId: "a1",
  name: "Alpha Agent",
  role: "engineer",
  icon: null,
  online: "active",
  now: "Reviewing PR",
  last: "Wrote tests",
  report: "All systems go",
};

// ── helpers ───────────────────────────────────────────────────────────────────

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

/** Sets a textarea's value through the native setter so React's onChange fires. */
function typeInto(textarea: HTMLTextAreaElement, text: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Channels page", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockChannelsApi.list.mockResolvedValue([CHANNEL]);
    mockChannelsApi.messages.mockResolvedValue([MESSAGE, AGENT_REPLY]);
    mockChannelsApi.members.mockResolvedValue([MEMBER]);
    mockChannelsApi.post.mockResolvedValue({ ...MESSAGE, id: "msg3" });
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the channel list, message stream, and member status panel", async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Channels />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    // channel list shows channel name prefixed with #
    expect(container.textContent).toMatch(/# marketing|#marketing/i);

    // member panel shows agent name and report
    expect(container.textContent).toContain("Alpha Agent");
    expect(container.textContent).toContain("All systems go");
  });

  it("submitting the composer calls channelsApi.post", async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Channels />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    await act(async () => {
      typeInto(textarea!, "Hello world");
    });

    const sendButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="channel-send"]',
    );
    expect(sendButton).not.toBeNull();

    await act(async () => {
      sendButton!.click();
    });
    await flushReact();

    expect(mockChannelsApi.post).toHaveBeenCalledWith("ch1", "Hello world");
  });

  it("invalidates messages and members queries on channel.message.created WS event", async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Channels />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    // The page should have opened a WebSocket and auto-selected the first channel (ch1).
    const ws = FakeWebSocket.lastInstance;
    expect(ws).not.toBeNull();

    // Spy on invalidateQueries AFTER the socket is up.
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // Simulate the backend pushing a channel.message.created event for ch1.
    await act(async () => {
      ws!.simulateMessage({
        type: "channel.message.created",
        companyId: "c1",
        payload: { channelId: "ch1", messageId: "msg99" },
        createdAt: new Date().toISOString(),
      });
    });
    await flushReact();

    // Both the messages and members query keys should have been invalidated.
    const calledKeys = invalidateSpy.mock.calls.map((call) =>
      JSON.stringify((call[0] as { queryKey: unknown }).queryKey),
    );
    expect(calledKeys.some((k) => k.includes("messages") && k.includes("ch1"))).toBe(true);
    expect(calledKeys.some((k) => k.includes("members") && k.includes("ch1"))).toBe(true);
  });

  it("nie invaliduje gdy event dotyczy innego kanału", async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Channels />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const ws = FakeWebSocket.lastInstance;
    expect(ws).not.toBeNull();

    // Spy AFTER the socket is up and the first channel (ch1) is selected.
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // Event targets a DIFFERENT channel than the active one (ch1) → no-op.
    await act(async () => {
      ws!.simulateMessage({
        type: "channel.message.created",
        companyId: "c1",
        payload: { channelId: "OTHER", messageId: "m99" },
        createdAt: new Date().toISOString(),
      });
    });
    await flushReact();

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("renders messages oldest-first even when API returns them newest-first (DESC)", async () => {
    // Backend returns DESC (newest first): AGENT_REPLY (12:01) then MESSAGE (12:00)
    mockChannelsApi.messages.mockResolvedValue([AGENT_REPLY, MESSAGE]);

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Channels />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const bodyText = container.textContent ?? "";
    const olderPos = bodyText.indexOf("Hello from user");
    const newerPos = bodyText.indexOf("Reply from agent");
    // Older message (MESSAGE, 12:00) should appear before newer (AGENT_REPLY, 12:01) in the DOM
    expect(olderPos).toBeGreaterThan(-1);
    expect(newerPos).toBeGreaterThan(-1);
    expect(olderPos).toBeLessThan(newerPos);
  });

  it("shows an error and keeps the text when the post fails", async () => {
    mockChannelsApi.post.mockRejectedValueOnce(new Error("boom"));

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Channels />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    await act(async () => {
      typeInto(textarea!, "This should fail");
    });

    const sendButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="channel-send"]',
    );
    expect(sendButton).not.toBeNull();

    await act(async () => {
      sendButton!.click();
    });
    await flushReact();

    expect(mockChannelsApi.post).toHaveBeenCalledWith("ch1", "This should fail");

    // Error message is shown via role="alert"
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();

    // Typed text is preserved for retry.
    const textareaAfter = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textareaAfter?.value).toBe("This should fail");
  });
});
