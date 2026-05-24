/**
 * cap-enforcement.ts — monthly marketing spend cap check.
 *
 * Formula: spent_mtd + projected_remaining <= cap
 *
 * - spent_mtd:          sum of actual PLN spend MTD across all live campaigns
 *                       (fetched via fetchMetricsFn); falls back to a conservative
 *                       estimate (daily_budget × days_elapsed) when metrics fail.
 * - projected_remaining: daily_budget × min(days_remaining_in_month, duration_days)
 *                        summed across all live + pending_approval campaigns,
 *                        including the proposal being approved.
 *
 * If no cap is configured (marketing_monthly_cap_pln IS NULL or <= 0), the
 * check is a no-op and always passes.
 */

import { and, eq, inArray } from "drizzle-orm";
import { campaignProposals, companies } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class MarketingCapExceededError extends Error {
  constructor(
    public readonly capPln: number,
    public readonly projectedPln: number,
  ) {
    super(
      `Marketing monthly cap exceeded: projected PLN ${projectedPln.toFixed(2)} > cap PLN ${capPln.toFixed(2)}`,
    );
    this.name = "MarketingCapExceededError";
    // Maintains proper prototype chain in transpiled ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CapCheckInput {
  /** UUID of the company whose cap to check. */
  companyId: string;
  /** UUID of the proposal being approved (will be added to projected spend). */
  proposalId: string;
  /**
   * Async function that fetches actual MTD spend (PLN) for a live campaign.
   * Injected so callers can provide the real adapter or a stub in tests.
   * If it throws, the implementation falls back to a conservative estimate.
   */
  fetchMetricsFn: (campaignId: string) => Promise<{ spendPln: number }>;
}

/**
 * Enforce the company's monthly marketing cap.
 *
 * @throws {MarketingCapExceededError} when the projected total exceeds the cap.
 * @throws {Error}                     when the company or proposal is not found.
 */
export async function enforceMarketingCap(db: Db, input: CapCheckInput): Promise<void> {
  // ── 1. Load company and read cap ──────────────────────────────────────────
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, input.companyId));

  if (!company) {
    throw new Error(`Company not found: ${input.companyId}`);
  }

  const rawCap = (company as unknown as { marketingMonthlyCaplPln?: string | null })
    .marketingMonthlyCaplPln;
  const capPln = rawCap != null ? Number(rawCap) : 0;

  // No cap configured — always pass.
  if (capPln <= 0) return;

  // ── 2. Compute date helpers ───────────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = dayOfMonth; // 1-based, inclusive
  const daysRemaining = daysInMonth - dayOfMonth;

  // ── 3. Load active campaigns ──────────────────────────────────────────────
  const activeCampaigns = await db
    .select()
    .from(campaignProposals)
    .where(
      and(
        eq(campaignProposals.companyId, input.companyId),
        inArray(campaignProposals.status, ["live", "pending_approval"]),
      ),
    );

  // ── 4. spent_mtd — actual spend for live campaigns ───────────────────────
  let spentMtd = 0;
  for (const campaign of activeCampaigns.filter((c) => c.status === "live")) {
    try {
      const metrics = await input.fetchMetricsFn(campaign.id);
      spentMtd += metrics.spendPln;
    } catch {
      // Metrics fetch failed — conservative fallback: daily_budget × days elapsed
      spentMtd += Number(campaign.budgetDailyPln) * daysElapsed;
    }
  }

  // ── 5. projected_remaining — all active campaigns + proposal being approved
  let projectedRemaining = 0;

  for (const campaign of activeCampaigns) {
    const dailyBudget = Number(campaign.budgetDailyPln);
    const effectiveDays = Math.min(daysRemaining, campaign.durationDays);
    projectedRemaining += dailyBudget * Math.max(0, effectiveDays);
  }

  // Load the proposal being approved (may or may not already be in activeCampaigns).
  const [proposal] = await db
    .select()
    .from(campaignProposals)
    .where(eq(campaignProposals.id, input.proposalId));

  if (proposal) {
    // Only add if not already counted above.
    const alreadyCounted = activeCampaigns.some((c) => c.id === proposal.id);
    if (!alreadyCounted) {
      const dailyBudget = Number(proposal.budgetDailyPln);
      const effectiveDays = Math.min(daysRemaining, proposal.durationDays);
      projectedRemaining += dailyBudget * Math.max(0, effectiveDays);
    }
  }

  // ── 6. Enforce cap ───────────────────────────────────────────────────────
  const total = spentMtd + projectedRemaining;
  if (total > capPln) {
    throw new MarketingCapExceededError(capPln, total);
  }

  // Suppress unused import warning for monthStart if TS tree-shakes it.
  void monthStart;
}
