import type { Router, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { campaignProposals } from "@paperclipai/db";

export interface CampaignsRouteDeps {
  db: Db;
}

interface CampaignDto {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  goal: string;
  status: string;
  budgetDailyPln: string;
  durationDays: number;
  createdAt: string;
  roas?: number;
}

export function registerCampaignsRoute(router: Router, deps: CampaignsRouteDeps): void {
  router.get(
    "/companies/:companyId/campaigns",
    async (req: Request, res: Response) => {
      const companyIdRaw = req.params["companyId"];
      const companyId = typeof companyIdRaw === "string" ? companyIdRaw : undefined;
      if (!companyId) {
        res.status(400).json({ error: "companyId required" });
        return;
      }
      const statusFilter = typeof req.query["status"] === "string" ? (req.query["status"] as string) : undefined;

      const whereExpr = statusFilter
        ? and(eq(campaignProposals.companyId, companyId), eq(campaignProposals.status, statusFilter))
        : eq(campaignProposals.companyId, companyId);

      const rows = await deps.db
        .select()
        .from(campaignProposals)
        .where(whereExpr)
        .orderBy(desc(campaignProposals.createdAt))
        .limit(200);

      const dto: CampaignDto[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        platform: row.platform,
        goal: row.goal,
        status: row.status,
        budgetDailyPln: row.budgetDailyPln,
        durationDays: row.durationDays,
        createdAt: row.createdAt.toISOString(),
      }));

      res.json(dto);
    },
  );
}
