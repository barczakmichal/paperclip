import { describe, it, expect, vi } from "vitest";

// Mock fetch globally for this test module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stub
const { registerMetaOAuthRoutes } = await import("../server-routes/meta-oauth.js");

describe("Meta OAuth — registerMetaOAuthRoutes", () => {
  it("saves three secrets on successful callback", async () => {
    const saved: Record<string, string> = {};

    // Simulate Express router object
    const routes: Record<string, (req: unknown, res: unknown) => void> = {};
    const router = {
      get: (path: string, handler: (req: unknown, res: unknown) => void) => {
        routes[path] = handler;
      },
    };

    registerMetaOAuthRoutes(router as never, {
      getMetaAppId: () => "APP_ID",
      getMetaAppSecret: () => "APP_SECRET",
      saveSecret: async (_, key, value) => { saved[key] = value; },
    });

    // Prime state via start handler (simulated)
    const startReq = { query: { companyId: "company-1" } };
    const startRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    routes["/oauth/meta/start"]?.(startReq, startRes);
    // Extract state from redirect URL
    const redirectCall = startRes.redirect.mock.calls[0][0] as string;
    const state = new URL(redirectCall).searchParams.get("state")!;

    // Mock fetch responses
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "short_tok" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "long_tok" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "act_123" }] }) });

    const callbackReq = { query: { code: "CODE", state } };
    const callbackRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes["/oauth/meta/callback"]?.(callbackReq, callbackRes);

    expect(saved["marketing-ai/meta/access_token"]).toBe("short_tok");
    expect(saved["marketing-ai/meta/long_lived_token"]).toBe("long_tok");
    expect(saved["marketing-ai/meta/ad_account_id"]).toBe("act_123");
  });
});
