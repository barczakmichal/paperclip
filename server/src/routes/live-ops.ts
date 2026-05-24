import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { liveOpsService } from "../services/live-ops.js";
import { assertCompanyAccess } from "./authz.js";

export function liveOpsRoutes(db: Db) {
  const router = Router();
  const svc = liveOpsService(db);

  router.get("/companies/:companyId/live-agents", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const rows = await svc.listLiveAgents(companyId);
      res.json({ agents: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
