import { randomBytes } from "node:crypto";
import type { Router, Request, Response } from "express";

// State cache: state hex -> companyId (in-process, expires 10min).
const pendingStates = new Map<string, { companyId: string; expiresAt: number }>();

export function registerMetaOAuthRoutes(router: Router, deps: {
  getMetaAppId: () => string;
  getMetaAppSecret: () => string;
  saveSecret: (companyId: string, key: string, value: string) => Promise<void>;
}): void {
  const REDIRECT_URI = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/api/plugins/marketing-ai/oauth/meta/callback`
    : "http://localhost:3100/api/plugins/marketing-ai/oauth/meta/callback";

  // Step 1: initiate OAuth — caller passes ?companyId=...
  router.get("/oauth/meta/start", (req: Request, res: Response) => {
    const companyId = req.query["companyId"] as string | undefined;
    if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

    const state = randomBytes(32).toString("hex");
    pendingStates.set(state, { companyId, expiresAt: Date.now() + 10 * 60_000 });

    const params = new URLSearchParams({
      client_id: deps.getMetaAppId(),
      redirect_uri: REDIRECT_URI,
      scope: "ads_management,ads_read,business_management",
      response_type: "code",
      state,
    });
    res.redirect(`https://www.facebook.com/v20.0/dialog/oauth?${params}`);
  });

  // Step 2: callback — exchange code for token, save secrets
  router.get("/oauth/meta/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) { res.status(400).json({ error }); return; }

    const pending = state ? pendingStates.get(state) : undefined;
    if (!pending || pending.expiresAt < Date.now()) {
      res.status(400).json({ error: "Invalid or expired OAuth state" });
      return;
    }
    pendingStates.delete(state);
    const { companyId } = pending;

    // Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", deps.getMetaAppId());
    tokenUrl.searchParams.set("client_secret", deps.getMetaAppSecret());
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      res.status(502).json({ error: "Meta token exchange failed" });
      return;
    }
    const tokenJson = await tokenRes.json() as { access_token: string };
    const shortToken = tokenJson.access_token;

    // Exchange for long-lived token
    const llUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", deps.getMetaAppId());
    llUrl.searchParams.set("client_secret", deps.getMetaAppSecret());
    llUrl.searchParams.set("fb_exchange_token", shortToken);

    const llRes = await fetch(llUrl.toString());
    const llJson = await llRes.json() as { access_token: string };
    const longToken = llJson.access_token;

    // Fetch ad account ID (first account user has access to)
    const accsRes = await fetch(
      `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name&access_token=${longToken}`
    );
    const accsJson = await accsRes.json() as { data: Array<{ id: string }> };
    const adAccountId = accsJson.data?.[0]?.id ?? "";

    await Promise.all([
      deps.saveSecret(companyId, "marketing-ai/meta/access_token", shortToken),
      deps.saveSecret(companyId, "marketing-ai/meta/long_lived_token", longToken),
      deps.saveSecret(companyId, "marketing-ai/meta/ad_account_id", adAccountId),
    ]);

    // Redirect back to settings page
    res.redirect("/instance/settings/marketing-ai?meta=connected");
  });
}
