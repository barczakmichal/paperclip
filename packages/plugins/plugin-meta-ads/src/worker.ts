import {
  definePlugin,
  runWorker,
  type PluginContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import manifest, { DEFAULT_CONFIG, PLUGIN_ID } from "./manifest.js";

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

type MetaAdsConfig = {
  tokenSecretRef: string;
  accountIdSecretRef: string;
  appIdSecretRef: string;
  appSecretSecretRef: string;
  pageIdSecretRef: string;
  dailyLimitCents: number;
  monthlyLimitCents: number;
  approvalThresholdCents: number;
  budgetIncreaseMaxPct: number;
  apiVersion: string;
};

// ---------------------------------------------------------------------------
// Resolved credentials (never stored, resolved at call time)
// ---------------------------------------------------------------------------

type MetaCreds = {
  accessToken: string;
  accountId: string;    // includes "act_" prefix
  apiVersion: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getConfig(ctx: PluginContext): Promise<MetaAdsConfig> {
  const raw = (await ctx.config.get()) as Partial<MetaAdsConfig> | null;
  return {
    tokenSecretRef: raw?.tokenSecretRef ?? DEFAULT_CONFIG.tokenSecretRef,
    accountIdSecretRef: raw?.accountIdSecretRef ?? DEFAULT_CONFIG.accountIdSecretRef,
    appIdSecretRef: raw?.appIdSecretRef ?? DEFAULT_CONFIG.appIdSecretRef,
    appSecretSecretRef: raw?.appSecretSecretRef ?? DEFAULT_CONFIG.appSecretSecretRef,
    pageIdSecretRef: raw?.pageIdSecretRef ?? DEFAULT_CONFIG.pageIdSecretRef,
    dailyLimitCents: raw?.dailyLimitCents ?? DEFAULT_CONFIG.dailyLimitCents,
    monthlyLimitCents: raw?.monthlyLimitCents ?? DEFAULT_CONFIG.monthlyLimitCents,
    approvalThresholdCents: raw?.approvalThresholdCents ?? DEFAULT_CONFIG.approvalThresholdCents,
    budgetIncreaseMaxPct: raw?.budgetIncreaseMaxPct ?? DEFAULT_CONFIG.budgetIncreaseMaxPct,
    apiVersion: raw?.apiVersion ?? DEFAULT_CONFIG.apiVersion,
  };
}

async function resolveCreds(ctx: PluginContext, config: MetaAdsConfig): Promise<MetaCreds> {
  const [accessToken, accountId] = await Promise.all([
    ctx.secrets.resolve(config.tokenSecretRef),
    ctx.secrets.resolve(config.accountIdSecretRef),
  ]);
  const normalizedAccountId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  return { accessToken, accountId: normalizedAccountId, apiVersion: config.apiVersion };
}

async function metaGet(creds: MetaCreds, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`https://graph.facebook.com/${creds.apiVersion}/${path}`);
  url.searchParams.set("access_token", creds.accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const json = await res.json() as { error?: { message: string; code: number } };
  if (!res.ok || json.error) {
    throw new Error(`Meta API error: ${json.error?.message ?? res.statusText} (code ${json.error?.code ?? res.status})`);
  }
  return json;
}

async function metaPost(creds: MetaCreds, path: string, body: Record<string, string | number>): Promise<unknown> {
  const url = `https://graph.facebook.com/${creds.apiVersion}/${path}`;
  const form = new URLSearchParams();
  form.set("access_token", creds.accessToken);
  for (const [k, v] of Object.entries(body)) {
    form.set(k, String(v));
  }
  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json() as { error?: { message: string; code: number } };
  if (!res.ok || json.error) {
    throw new Error(`Meta API error: ${json.error?.message ?? res.statusText} (code ${json.error?.code ?? res.status})`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Spend tracking via plugin state (grosze)
// ---------------------------------------------------------------------------

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

async function getDailySpentCents(ctx: PluginContext): Promise<number> {
  const val = await ctx.state.get({ scopeKind: "instance", stateKey: `meta-ads:spend:daily:${todayKey()}` });
  return typeof val === "number" ? val : 0;
}

async function getMonthlySpentCents(ctx: PluginContext): Promise<number> {
  const val = await ctx.state.get({ scopeKind: "instance", stateKey: `meta-ads:spend:monthly:${monthKey()}` });
  return typeof val === "number" ? val : 0;
}

async function recordSpend(ctx: PluginContext, spentCents: number): Promise<void> {
  const daily = await getDailySpentCents(ctx);
  const monthly = getMonthlySpentCents(ctx);
  await Promise.all([
    ctx.state.set({ scopeKind: "instance", stateKey: `meta-ads:spend:daily:${todayKey()}` }, daily + spentCents),
    ctx.state.set({ scopeKind: "instance", stateKey: `meta-ads:spend:monthly:${monthKey()}` }, (await monthly) + spentCents),
  ]);
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

type AuditEntry = {
  id: string;
  ts: string;
  action: string;
  campaignId?: string;
  before?: unknown;
  after?: unknown;
  approvalTaskId?: string;
  success: boolean;
  error?: string;
};

async function appendAudit(ctx: PluginContext, entry: Omit<AuditEntry, "id" | "ts">): Promise<void> {
  const stateKey = `meta-ads:audit:${todayKey()}`;
  const existing = (await ctx.state.get({ scopeKind: "instance", stateKey })) as AuditEntry[] | null;
  const log: AuditEntry[] = existing ?? [];
  log.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    ...entry,
  });
  // Keep last 200 entries per day
  if (log.length > 200) log.splice(0, log.length - 200);
  await ctx.state.set({ scopeKind: "instance", stateKey }, log);
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

type GuardrailOk = { ok: true };
type GuardrailHardStop = { ok: false; hardBlocked: true; message: string };
type GuardrailApproval = { ok: false; hardBlocked: false; approvalNeeded: true; message: string };
type GuardrailResult = GuardrailOk | GuardrailHardStop | GuardrailApproval;

function isHardStop(r: GuardrailResult): r is GuardrailHardStop {
  return !r.ok && (r as GuardrailHardStop).hardBlocked === true;
}
function needsApproval(r: GuardrailResult): r is GuardrailApproval {
  return !r.ok && (r as GuardrailApproval).hardBlocked === false;
}

async function checkSpendGuardrails(
  ctx: PluginContext,
  config: MetaAdsConfig,
  plannedCents: number,
): Promise<GuardrailResult> {
  const [daily, monthly] = await Promise.all([getDailySpentCents(ctx), getMonthlySpentCents(ctx)]);
  if (daily + plannedCents > config.dailyLimitCents) {
    return {
      ok: false,
      hardBlocked: true,
      message: `HARD STOP: daily cap exceeded (${(daily + plannedCents) / 100} PLN > ${config.dailyLimitCents / 100} PLN limit)`,
    };
  }
  if (monthly + plannedCents > config.monthlyLimitCents) {
    return {
      ok: false,
      hardBlocked: true,
      message: `HARD STOP: monthly cap exceeded (${(monthly + plannedCents) / 100} PLN > ${config.monthlyLimitCents / 100} PLN limit)`,
    };
  }
  if (plannedCents > config.approvalThresholdCents) {
    return {
      ok: false,
      hardBlocked: false,
      approvalNeeded: true,
      message: `Approval required: planned spend ${plannedCents / 100} PLN exceeds threshold ${config.approvalThresholdCents / 100} PLN`,
    };
  }
  return { ok: true };
}

function checkBudgetIncreaseGuardrails(
  config: MetaAdsConfig,
  currentCents: number,
  newCents: number,
): GuardrailResult {
  if (currentCents <= 0 || newCents <= currentCents) return { ok: true };
  const pct = Math.round(((newCents - currentCents) * 100) / currentCents);
  if (pct > config.budgetIncreaseMaxPct) {
    return {
      ok: false,
      hardBlocked: false,
      approvalNeeded: true,
      message: `Approval required: budget increase ${pct}% exceeds auto-approve threshold ${config.budgetIncreaseMaxPct}%`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Paperclip approval task creation
// ---------------------------------------------------------------------------

async function createApprovalTask(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  title: string,
  description: string,
): Promise<string> {
  const issue = await ctx.issues.create({
    companyId: runCtx.companyId,
    projectId: runCtx.projectId,
    title: `[Meta Ads Approval] ${title}`,
    description: `${description}\n\n**Issued by:** Meta Ads plugin\n**Action:** Re-run the tool with the returned \`approvalTaskId\` after closing this task as Done.`,
  });
  return issue.id;
}

async function verifyApprovalTask(
  ctx: PluginContext,
  approvalTaskId: string,
  companyId: string,
): Promise<{ approved: boolean; status: string }> {
  try {
    const issue = await ctx.issues.get(approvalTaskId, companyId);
    if (!issue) return { approved: false, status: "not found" };
    return { approved: issue.status === "done", status: issue.status };
  } catch {
    return { approved: false, status: "error checking approval" };
  }
}

// ---------------------------------------------------------------------------
// Tool: list-campaigns
// ---------------------------------------------------------------------------

async function toolListCampaigns(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const creds = await resolveCreds(ctx, config);

  const statusFilter =
    typeof params.status === "string" ? params.status : "ACTIVE,PAUSED";
  const limit = typeof params.limit === "number" ? Math.min(params.limit, 100) : 50;

  const data = await metaGet(creds, `${creds.accountId}/campaigns`, {
    fields: "id,name,status,effective_status,objective,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget",
    effective_status: `[${statusFilter.split(",").map(s => `"${s.trim()}"`).join(",")}]`,
    limit: String(limit),
  }) as { data: unknown[] };

  const campaigns = data.data ?? [];

  return {
    content: `Found ${campaigns.length} campaign(s) on account ${creds.accountId}`,
    data: {
      success: true,
      accountId: creds.accountId,
      apiVersion: creds.apiVersion,
      campaigns,
      count: campaigns.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: get-insights
// ---------------------------------------------------------------------------

async function toolGetInsights(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const creds = await resolveCreds(ctx, config);

  const dateRange = typeof params.dateRange === "string" ? params.dateRange : "last_7d";
  const metrics =
    typeof params.metrics === "string"
      ? params.metrics
      : "spend,impressions,clicks,cpm,ctr,actions";
  const level = typeof params.level === "string" ? params.level : "campaign";
  const campaignId = typeof params.campaignId === "string" ? params.campaignId : null;

  const targetPath = campaignId ? campaignId : `${creds.accountId}`;
  const queryParams: Record<string, string> = {
    fields: metrics,
    date_preset: dateRange,
    level,
  };

  const data = await metaGet(creds, `${targetPath}/insights`, queryParams) as {
    data: Array<{ spend?: string; campaign_count?: number }>;
    summary?: { total_cpm?: string; total_spend?: string };
  };

  const insights = data.data ?? [];
  const totalSpendPln =
    insights.reduce((sum, row) => sum + parseFloat(row.spend ?? "0"), 0);

  return {
    content: `Insights for ${campaignId ? `campaign ${campaignId}` : `account ${creds.accountId}`}: ${insights.length} row(s), total spend ${totalSpendPln.toFixed(2)} PLN over ${dateRange}`,
    data: {
      success: true,
      accountId: creds.accountId,
      apiVersion: creds.apiVersion,
      scope: campaignId ? "campaign" : "account",
      dateRange,
      level,
      insights,
      summary: {
        totalSpendPln,
        rowCount: insights.length,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: set-budget
// ---------------------------------------------------------------------------

async function toolSetBudget(
  ctx: PluginContext,
  params: Record<string, unknown>,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const creds = await resolveCreds(ctx, config);

  const campaignId = typeof params.campaignId === "string" ? params.campaignId : null;
  if (!campaignId) return { error: "campaignId is required" };
  const newBudgetCents = typeof params.dailyBudgetCents === "number" ? params.dailyBudgetCents : null;
  if (!newBudgetCents || newBudgetCents <= 0) return { error: "dailyBudgetCents must be a positive number" };

  // Read current budget
  const current = await metaGet(creds, campaignId, {
    fields: "id,name,status,daily_budget",
  }) as { id: string; name: string; status: string; daily_budget?: string };
  const currentBudgetCents = parseInt(current.daily_budget ?? "0", 10);

  // Guardrails
  const spendCheck = await checkSpendGuardrails(ctx, config, newBudgetCents);
  const increaseCheck = checkBudgetIncreaseGuardrails(config, currentBudgetCents, newBudgetCents);

  if (isHardStop(spendCheck)) {
    await appendAudit(ctx, { action: "set-budget", campaignId, success: false, error: spendCheck.message });
    return { error: spendCheck.message };
  }

  const approvalNeeded = needsApproval(spendCheck) || needsApproval(increaseCheck);
  const approvalReason = needsApproval(spendCheck) ? spendCheck.message : (needsApproval(increaseCheck) ? increaseCheck.message : "");

  if (approvalNeeded) {
    const existingApprovalId = typeof params.approvalTaskId === "string" ? params.approvalTaskId : null;
    if (!existingApprovalId) {
      const approvalTaskId = await createApprovalTask(
        ctx, runCtx,
        `Set budget for campaign "${current.name}" to ${newBudgetCents / 100} PLN/day`,
        `**Reason approval required:** ${approvalReason}\n\n` +
        `**Campaign:** ${current.name} (${campaignId})\n` +
        `**Current budget:** ${currentBudgetCents / 100} PLN/day\n` +
        `**Requested budget:** ${newBudgetCents / 100} PLN/day\n\n` +
        `Close this task as Done to approve, or cancel to reject.`,
      );
      await appendAudit(ctx, { action: "set-budget:approval-requested", campaignId, success: false, approvalTaskId });
      return {
        content: `Approval required. Created approval task ${approvalTaskId}. Re-run with approvalTaskId="${approvalTaskId}" after closing that task as Done.`,
        data: { success: false, approvalNeeded: true, approvalTaskId, reason: approvalReason },
      };
    }

    const approval = await verifyApprovalTask(ctx, existingApprovalId, runCtx.companyId);
    if (!approval.approved) {
      return {
        error: `Approval task ${existingApprovalId} is not yet done (status: ${approval.status}). Complete it first.`,
        data: { success: false, approvalTaskId: existingApprovalId, approvalStatus: approval.status },
      };
    }
  }

  // Execute
  await metaPost(creds, campaignId, { daily_budget: newBudgetCents });
  await recordSpend(ctx, 0); // budget change doesn't count as spend

  const afterState = await metaGet(creds, campaignId, { fields: "id,name,status,daily_budget" });
  await appendAudit(ctx, {
    action: "set-budget",
    campaignId,
    before: { daily_budget: currentBudgetCents },
    after: afterState,
    success: true,
    approvalTaskId: typeof params.approvalTaskId === "string" ? params.approvalTaskId : undefined,
  });

  return {
    content: `Budget updated for campaign ${campaignId}: ${currentBudgetCents / 100} PLN → ${newBudgetCents / 100} PLN/day`,
    data: { success: true, campaignId, previousBudgetCents: currentBudgetCents, newBudgetCents, after: afterState },
  };
}

// ---------------------------------------------------------------------------
// Tool: create-campaign
// ---------------------------------------------------------------------------

async function toolCreateCampaign(
  ctx: PluginContext,
  params: Record<string, unknown>,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const creds = await resolveCreds(ctx, config);

  const name = typeof params.name === "string" ? params.name : null;
  if (!name) return { error: "name is required" };
  const objective = typeof params.objective === "string" ? params.objective : null;
  if (!objective) return { error: "objective is required" };
  const dailyBudgetCents = typeof params.dailyBudgetCents === "number" ? params.dailyBudgetCents : null;
  if (!dailyBudgetCents || dailyBudgetCents <= 0) return { error: "dailyBudgetCents must be a positive number" };
  const status = typeof params.status === "string" ? params.status : "PAUSED";

  // Guardrails
  const spendCheck = await checkSpendGuardrails(ctx, config, dailyBudgetCents);

  if (isHardStop(spendCheck)) {
    await appendAudit(ctx, { action: "create-campaign", success: false, error: spendCheck.message });
    return { error: spendCheck.message };
  }

  if (needsApproval(spendCheck)) {
    const existingApprovalId = typeof params.approvalTaskId === "string" ? params.approvalTaskId : null;
    if (!existingApprovalId) {
      const approvalTaskId = await createApprovalTask(
        ctx, runCtx,
        `Create campaign "${name}" with ${dailyBudgetCents / 100} PLN/day budget`,
        `**Reason:** ${spendCheck.message}\n\n` +
        `**Campaign name:** ${name}\n` +
        `**Objective:** ${objective}\n` +
        `**Daily budget:** ${dailyBudgetCents / 100} PLN/day\n` +
        `**Initial status:** ${status}\n\n` +
        `Close this task as Done to approve.`,
      );
      await appendAudit(ctx, { action: "create-campaign:approval-requested", success: false, approvalTaskId });
      return {
        content: `Approval required. Created approval task ${approvalTaskId}. Re-run with approvalTaskId="${approvalTaskId}" after approval.`,
        data: { success: false, approvalNeeded: true, approvalTaskId },
      };
    }

    const approval = await verifyApprovalTask(ctx, existingApprovalId, runCtx.companyId);
    if (!approval.approved) {
      return {
        error: `Approval task ${existingApprovalId} not yet done (status: ${approval.status}).`,
        data: { success: false, approvalTaskId: existingApprovalId },
      };
    }
  }

  // Execute
  const body: Record<string, string | number> = {
    name,
    objective,
    status,
    daily_budget: dailyBudgetCents,
    special_ad_categories: "[]",
  };

  const created = await metaPost(creds, `${creds.accountId}/campaigns`, body) as { id: string };

  await appendAudit(ctx, {
    action: "create-campaign",
    campaignId: created.id,
    after: { name, objective, status, dailyBudgetCents },
    success: true,
    approvalTaskId: typeof params.approvalTaskId === "string" ? params.approvalTaskId : undefined,
  });

  return {
    content: `Campaign created: "${name}" (ID: ${created.id}), status: ${status}, budget: ${dailyBudgetCents / 100} PLN/day`,
    data: { success: true, campaignId: created.id, name, objective, status, dailyBudgetCents },
  };
}

// ---------------------------------------------------------------------------
// Tool: pause-campaign
// ---------------------------------------------------------------------------

async function toolPauseCampaign(
  ctx: PluginContext,
  params: Record<string, unknown>,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const creds = await resolveCreds(ctx, config);

  const campaignId = typeof params.campaignId === "string" ? params.campaignId : null;
  if (!campaignId) return { error: "campaignId is required" };
  const reason = typeof params.reason === "string" ? params.reason : "Paused by agent";

  const existingApprovalId = typeof params.approvalTaskId === "string" ? params.approvalTaskId : null;

  // Pause ALWAYS requires approval
  if (!existingApprovalId) {
    const current = await metaGet(creds, campaignId, { fields: "id,name,status" }) as { name: string; status: string };
    const approvalTaskId = await createApprovalTask(
      ctx, runCtx,
      `Pause campaign "${current.name}"`,
      `**Campaign:** ${current.name} (${campaignId})\n` +
      `**Current status:** ${current.status}\n` +
      `**Reason:** ${reason}\n\n` +
      `Close this task as Done to approve the pause.`,
    );
    await appendAudit(ctx, { action: "pause:approval-requested", campaignId, success: false, approvalTaskId });
    return {
      content: `Approval required to pause campaign ${campaignId}. Created task ${approvalTaskId}. Re-run with approvalTaskId="${approvalTaskId}" after approval.`,
      data: { success: false, approvalNeeded: true, approvalTaskId },
    };
  }

  const approval = await verifyApprovalTask(ctx, existingApprovalId, runCtx.companyId);
  if (!approval.approved) {
    return {
      error: `Approval task ${existingApprovalId} not yet done (status: ${approval.status}).`,
      data: { success: false, approvalTaskId: existingApprovalId },
    };
  }

  const before = await metaGet(creds, campaignId, { fields: "id,name,status,daily_budget" });
  await metaPost(creds, campaignId, { status: "PAUSED" });
  const after = await metaGet(creds, campaignId, { fields: "id,name,status,daily_budget" });

  await appendAudit(ctx, { action: "pause", campaignId, before, after, success: true, approvalTaskId: existingApprovalId });

  return {
    content: `Campaign ${campaignId} paused successfully.`,
    data: { success: true, campaignId, before, after },
  };
}

// ---------------------------------------------------------------------------
// Tool: resume-campaign
// ---------------------------------------------------------------------------

async function toolResumeCampaign(
  ctx: PluginContext,
  params: Record<string, unknown>,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const creds = await resolveCreds(ctx, config);

  const campaignId = typeof params.campaignId === "string" ? params.campaignId : null;
  if (!campaignId) return { error: "campaignId is required" };
  const reason = typeof params.reason === "string" ? params.reason : "Resumed by agent";

  const existingApprovalId = typeof params.approvalTaskId === "string" ? params.approvalTaskId : null;

  // Resume ALWAYS requires approval (spending money)
  if (!existingApprovalId) {
    const current = await metaGet(creds, campaignId, { fields: "id,name,status,daily_budget" }) as {
      name: string; status: string; daily_budget?: string;
    };
    const approvalTaskId = await createApprovalTask(
      ctx, runCtx,
      `Resume campaign "${current.name}"`,
      `**Campaign:** ${current.name} (${campaignId})\n` +
      `**Current status:** ${current.status}\n` +
      `**Daily budget:** ${parseFloat(current.daily_budget ?? "0") / 100} PLN\n` +
      `**Reason:** ${reason}\n\n` +
      `Close this task as Done to approve resuming. This will start spending budget immediately.`,
    );
    await appendAudit(ctx, { action: "resume:approval-requested", campaignId, success: false, approvalTaskId });
    return {
      content: `Approval required to resume campaign ${campaignId}. Created task ${approvalTaskId}. Re-run with approvalTaskId="${approvalTaskId}" after approval.`,
      data: { success: false, approvalNeeded: true, approvalTaskId },
    };
  }

  const approval = await verifyApprovalTask(ctx, existingApprovalId, runCtx.companyId);
  if (!approval.approved) {
    return {
      error: `Approval task ${existingApprovalId} not yet done (status: ${approval.status}).`,
      data: { success: false, approvalTaskId: existingApprovalId },
    };
  }

  const before = await metaGet(creds, campaignId, { fields: "id,name,status,daily_budget" });
  await metaPost(creds, campaignId, { status: "ACTIVE" });
  const after = await metaGet(creds, campaignId, { fields: "id,name,status,daily_budget" }) as {
    daily_budget?: string;
  };

  // Record daily budget as today's spend (optimistic: campaign is now active)
  const dailyBudgetCents = parseInt(after.daily_budget ?? "0", 10);
  if (dailyBudgetCents > 0) {
    await recordSpend(ctx, dailyBudgetCents);
  }

  await appendAudit(ctx, { action: "resume", campaignId, before, after, success: true, approvalTaskId: existingApprovalId });

  return {
    content: `Campaign ${campaignId} resumed (ACTIVE). Daily budget: ${dailyBudgetCents / 100} PLN/day.`,
    data: { success: true, campaignId, before, after },
  };
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} plugin setup — registering tools`);

    ctx.tools.register(
      "meta-ads/list-campaigns",
      manifest.tools![0]!,
      async (params, _runCtx): Promise<ToolResult> => {
        return toolListCampaigns(ctx, params as Record<string, unknown>);
      },
    );

    ctx.tools.register(
      "meta-ads/get-insights",
      manifest.tools![1]!,
      async (params, _runCtx): Promise<ToolResult> => {
        return toolGetInsights(ctx, params as Record<string, unknown>);
      },
    );

    ctx.tools.register(
      "meta-ads/set-budget",
      manifest.tools![2]!,
      async (params, runCtx): Promise<ToolResult> => {
        return toolSetBudget(ctx, params as Record<string, unknown>, runCtx);
      },
    );

    ctx.tools.register(
      "meta-ads/create-campaign",
      manifest.tools![3]!,
      async (params, runCtx): Promise<ToolResult> => {
        return toolCreateCampaign(ctx, params as Record<string, unknown>, runCtx);
      },
    );

    ctx.tools.register(
      "meta-ads/pause-campaign",
      manifest.tools![4]!,
      async (params, runCtx): Promise<ToolResult> => {
        return toolPauseCampaign(ctx, params as Record<string, unknown>, runCtx);
      },
    );

    ctx.tools.register(
      "meta-ads/resume-campaign",
      manifest.tools![5]!,
      async (params, runCtx): Promise<ToolResult> => {
        return toolResumeCampaign(ctx, params as Record<string, unknown>, runCtx);
      },
    );

    ctx.logger.info(`${PLUGIN_ID} plugin ready — 6 tools registered`);
  },

  async onHealth() {
    return {
      status: "ok",
      message: "Meta Ads plugin running. Token resolved per-call via ctx.secrets.resolve().",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
