import { randomBytes } from "node:crypto";
import type { Router, Request, Response } from "express";

const pendingStates = new Map<string, { companyId: string; expiresAt: number }>();

export function registerGoogleOAuthRoutes(router: Router, deps: {
  getClientId: () => string;
  getClientSecret: () => string;
  getDeveloperToken: () => string;
  saveSecret: (companyId: string, key: string, value: string) => Promise<void>;
}): void {
  const REDIRECT_URI = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/api/plugins/marketing-ai/oauth/google/callback`
    : "http://localhost:3100/api/plugins/marketing-ai/oauth/google/callback";

  router.get("/oauth/google/start", (req: Request, res: Response) => {
    const companyId = req.query["companyId"] as string | undefined;
    if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

    const state = randomBytes(32).toString("hex");
    pendingStates.set(state, { companyId, expiresAt: Date.now() + 10 * 60_000 });

    const params = new URLSearchParams({
      client_id: deps.getClientId(),
      redirect_uri: REDIRECT_URI,
      scope: "https://www.googleapis.com/auth/adwords",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get("/oauth/google/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) { res.status(400).json({ error }); return; }

    const pending = state ? pendingStates.get(state) : undefined;
    if (!pending || pending.expiresAt < Date.now()) {
      res.status(400).json({ error: "Invalid or expired OAuth state" });
      return;
    }
    pendingStates.delete(state);
    const { companyId } = pending;

    // Exchange auth code for refresh token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: deps.getClientId(),
        client_secret: deps.getClientSecret(),
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) { res.status(502).json({ error: "Google token exchange failed" }); return; }

    const tokenJson = await tokenRes.json() as { refresh_token?: string };
    const refreshToken = tokenJson.refresh_token ?? "";

    // Customer ID: user provides in query OR we fetch from API in later iteration
    const customerId = (req.query["customerId"] as string | undefined) ?? "";

    await Promise.all([
      deps.saveSecret(companyId, "marketing-ai/google/refresh_token", refreshToken),
      deps.saveSecret(companyId, "marketing-ai/google/customer_id", customerId),
      deps.saveSecret(companyId, "marketing-ai/google/developer_token", deps.getDeveloperToken()),
    ]);

    res.redirect("/instance/settings/marketing-ai?google=connected");
  });
}
