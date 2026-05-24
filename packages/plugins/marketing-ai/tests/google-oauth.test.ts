import { describe, it, expect, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { registerGoogleOAuthRoutes } = await import("../server-routes/google-oauth.js");

describe("Google OAuth — registerGoogleOAuthRoutes", () => {
  it("saves refresh_token and developer_token on successful callback", async () => {
    const saved: Record<string, string> = {};
    const routes: Record<string, (req: unknown, res: unknown) => void> = {};
    const router = {
      get: (path: string, h: (req: unknown, res: unknown) => void) => { routes[path] = h; },
    };

    registerGoogleOAuthRoutes(router as never, {
      getClientId: () => "CID",
      getClientSecret: () => "CSECRET",
      getDeveloperToken: () => "DEV_TOKEN",
      saveSecret: async (_, key, value) => { saved[key] = value; },
    });

    const startReq = { query: { companyId: "company-1" } };
    const startRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    routes["/oauth/google/start"]?.(startReq, startRes);
    const redirectUrl = startRes.redirect.mock.calls[0][0] as string;
    const state = new URL(redirectUrl).searchParams.get("state")!;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ refresh_token: "rt_abc123", access_token: "at_xyz" }),
    });

    const callbackReq = { query: { code: "AUTH_CODE", state, customerId: "123-456-7890" } };
    const callbackRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes["/oauth/google/callback"]?.(callbackReq, callbackRes);

    expect(saved["marketing-ai/google/refresh_token"]).toBe("rt_abc123");
    expect(saved["marketing-ai/google/developer_token"]).toBe("DEV_TOKEN");
    expect(saved["marketing-ai/google/customer_id"]).toBe("123-456-7890");
  });
});
