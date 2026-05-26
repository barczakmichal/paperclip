import type { Router, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { campaignProposals, creatives, marketingAuditLog } from "@paperclipai/db";

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

  router.get(
    "/companies/:companyId/campaigns/:campaignId",
    async (req: Request, res: Response) => {
      const companyIdRaw = req.params["companyId"];
      const campaignIdRaw = req.params["campaignId"];
      const companyId = typeof companyIdRaw === "string" ? companyIdRaw : undefined;
      const campaignId = typeof campaignIdRaw === "string" ? campaignIdRaw : undefined;
      if (!companyId || !campaignId) {
        res.status(400).json({ error: "companyId and campaignId required" });
        return;
      }

      const [row] = await deps.db
        .select()
        .from(campaignProposals)
        .where(and(eq(campaignProposals.id, campaignId), eq(campaignProposals.companyId, companyId)));

      if (!row) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      const creativeRows = await deps.db
        .select()
        .from(creatives)
        .where(eq(creatives.proposalId, campaignId))
        .orderBy(desc(creatives.createdAt));

      const auditRows = await deps.db
        .select()
        .from(marketingAuditLog)
        .where(and(eq(marketingAuditLog.companyId, companyId), eq(marketingAuditLog.entityId, campaignId)))
        .orderBy(desc(marketingAuditLog.createdAt))
        .limit(100);

      res.json({
        campaign: {
          id: row.id,
          name: row.name,
          description: row.description,
          platform: row.platform,
          goal: row.goal,
          status: row.status,
          budgetDailyPln: row.budgetDailyPln,
          durationDays: row.durationDays,
          audienceBrief: row.audienceBrief,
          productIds: row.productIds,
          briefJson: row.briefJson,
          platformCampaignId: row.platformCampaignId,
          rejectionReason: row.rejectionReason,
          publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        creatives: creativeRows.map((c) => ({
          id: c.id,
          format: c.format,
          status: c.status,
          imageUrl: c.imageUrl,
          headlines: c.headlines,
          bodies: c.bodies,
          descriptions: c.descriptions,
          cta: c.cta,
          platformAssetId: c.platformAssetId,
          errorDetail: c.errorDetail,
          createdAt: c.createdAt.toISOString(),
        })),
        auditLog: auditRows.map((a) => ({
          id: a.id,
          action: a.action,
          userId: a.userId,
          agentId: a.agentId,
          entityType: a.entityType,
          payloadDiff: a.payloadDiff,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    },
  );
}
