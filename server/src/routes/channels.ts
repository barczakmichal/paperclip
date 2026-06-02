import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { postChannelMessageSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { channelService } from "../services/channels.js";
import { heartbeatService } from "../services/heartbeat.js";
import { logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { notFound } from "../errors.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";

// Górny limit liczby wiadomości zwracanych jednym GET — zabezpieczenie przed DoS
// (klient nie może wymusić nieograniczonego skanu tabeli przez ?limit=...).
export const CHANNEL_MESSAGES_MAX_LIMIT = 200;

export function channelRoutes(db: Db, opts: { pluginWorkerManager?: PluginWorkerManager } = {}) {
  const router = Router();
  const svc = channelService(db, {
    heartbeat: heartbeatService(db, { pluginWorkerManager: opts.pluginWorkerManager }),
  });

  router.get("/companies/:companyId/channels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    // TODO(Task 4 dług): sync na każdy GET to świadomy kompromis — robi N+1 zapisów
    // (insert/update kanałów) per żądanie. Produkcyjny hardening: throttling per companyId
    // (TTL in-memory lub bramka po timestampie ostatniego synca), żeby nie synchronizować
    // przy każdym odświeżeniu listy.
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

    const beforeRaw = req.query.before;
    let before: Date | undefined;
    if (typeof beforeRaw === "string" && beforeRaw.trim().length > 0) {
      const parsed = new Date(beforeRaw.trim());
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: "before must be a valid date" });
        return;
      }
      before = parsed;
    }

    const limitRaw = req.query.limit;
    let limit: number | undefined;
    if (limitRaw !== undefined) {
      const parsed = typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
        ? Number.parseInt(limitRaw, 10)
        : Number.NaN;
      if (!Number.isInteger(parsed) || parsed <= 0) {
        res.status(400).json({
          error: `limit must be a positive integer up to ${CHANNEL_MESSAGES_MAX_LIMIT}`,
        });
        return;
      }
      // Klampujemy w górę zamiast odrzucać — duży limit jest sprowadzany do bezpiecznego maksimum.
      limit = Math.min(parsed, CHANNEL_MESSAGES_MAX_LIMIT);
    }

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
    await logActivity(db, {
      companyId: channel.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId ?? null,
      runId: actor.runId ?? null,
      action: "channel.message.created",
      entityType: "channel",
      entityId: channelId,
      details: { messageId: message.id, kind: message.kind },
    });
    res.status(201).json(message);
  });

  return router;
}
