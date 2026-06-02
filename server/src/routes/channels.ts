import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { postChannelMessageSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { channelService } from "../services/channels.js";
import { heartbeatService } from "../services/heartbeat.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { notFound } from "../errors.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";

export function channelRoutes(db: Db, opts: { pluginWorkerManager?: PluginWorkerManager } = {}) {
  const router = Router();
  const svc = channelService(db, {
    heartbeat: heartbeatService(db, { pluginWorkerManager: opts.pluginWorkerManager }),
  });

  router.get("/companies/:companyId/channels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    await svc.syncForCompany(companyId);
    const channels = await svc.list(companyId);
    res.json(channels);
  });

  router.get("/channels/:channelId/members", async (req, res) => {
    const channelId = req.params.channelId as string;
    const channel = await svc.getChannel(channelId);
    if (!channel) {
      throw notFound("Channel not found");
    }
    assertCompanyAccess(req, channel.companyId);
    const members = await svc.memberStatuses(channelId);
    res.json(members);
  });

  router.get("/channels/:channelId/messages", async (req, res) => {
    const channelId = req.params.channelId as string;
    const channel = await svc.getChannel(channelId);
    if (!channel) {
      throw notFound("Channel not found");
    }
    assertCompanyAccess(req, channel.companyId);
    const before = typeof req.query.before === "string" && req.query.before.trim().length > 0
      ? req.query.before.trim()
      : undefined;
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
      ? Number.parseInt(limitRaw, 10)
      : undefined;
    const messages = await svc.listMessages(channelId, { before, limit });
    res.json(messages);
  });

  router.post("/channels/:channelId/messages", validate(postChannelMessageSchema), async (req, res) => {
    const channelId = req.params.channelId as string;
    const channel = await svc.getChannel(channelId);
    if (!channel) {
      throw notFound("Channel not found");
    }
    assertCompanyAccess(req, channel.companyId);
    const actor = getActorInfo(req);
    const message = await svc.postMessage(channelId, {
      body: req.body.body,
      ...(actor.actorType === "agent" && actor.agentId
        ? { agentId: actor.agentId }
        : { userId: actor.actorId }),
    });
    res.status(201).json(message);
  });

  return router;
}
