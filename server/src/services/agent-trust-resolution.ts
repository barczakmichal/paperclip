import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issues, projects } from "@paperclipai/db";
import { isUuidLike } from "@paperclipai/shared";
import { readObject } from "../lib/objects.js";
import { resolveCoreTrustPreset, type TrustPresetResolution } from "./trust-preset-resolver.js";

// Shared actor-trust resolution for HTTP guards. This is the single home for the
// "resolve an agent's effective trust preset from its run context" logic that was
// previously hand-copied (and had diverged in security-relevant ways) across
// routes/issues.ts, routes/agents.ts, and routes/companies.ts. Any new control-plane
// guard should call these helpers rather than re-deriving the sources.

export function readRunIssueId(context: Record<string, unknown> | null): string | null {
  const directIssueId = context?.issueId;
  if (typeof directIssueId === "string" && isUuidLike(directIssueId)) return directIssueId;
  const paperclipIssue = readObject(context?.paperclipIssue);
  const nestedIssueId = paperclipIssue?.id;
  return typeof nestedIssueId === "string" && isUuidLike(nestedIssueId) ? nestedIssueId : null;
}

// Resolves the effective trust preset for an agent's current run, feeding ALL four
// policy sources to resolveCoreTrustPreset:
//   1. the agent's own permissions,
//   2. the executionWorkspacePolicy of the project owning the run's issue,
//   3. the executionPolicy carried on the run's issue (fetched from the DB via the
//      run's contextSnapshot issueId — the run snapshot itself is NOT a reliable
//      carrier of that policy),
//   4. any executionPolicy embedded in the run's contextSnapshot.
// This mirrors resolveAgentSelfTrustPreset's original inline implementation in
// routes/agents.ts.
export async function resolveAgentRunScopedTrust(input: {
  db: Db;
  companyId: string;
  agent: { id: string; companyId?: string | null; permissions?: unknown };
  runId?: string | null;
}): Promise<TrustPresetResolution> {
  const run = input.runId
    ? await input.db
        .select({
          companyId: heartbeatRuns.companyId,
          agentId: heartbeatRuns.agentId,
          contextSnapshot: heartbeatRuns.contextSnapshot,
        })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.id, input.runId), eq(heartbeatRuns.companyId, input.companyId)))
        .then((rows) => rows[0] ?? null)
    : null;
  const runContext = run?.agentId === input.agent.id ? readObject(run.contextSnapshot) : null;
  const runExecutionPolicy = readObject(runContext?.executionPolicy);
  const runIssueId = readRunIssueId(runContext);
  const runScopedIssue = runIssueId
    ? await input.db
        .select({
          companyId: issues.companyId,
          projectId: issues.projectId,
          executionPolicy: issues.executionPolicy,
          projectExecutionWorkspacePolicy: projects.executionWorkspacePolicy,
        })
        .from(issues)
        .leftJoin(projects, and(eq(projects.id, issues.projectId), eq(projects.companyId, issues.companyId)))
        .where(and(eq(issues.id, runIssueId), eq(issues.companyId, input.companyId)))
        .then((rows) => rows[0] ?? null)
    : null;

  return resolveCoreTrustPreset({
    companyId: input.companyId,
    agent: input.agent,
    project: runScopedIssue?.projectId
      ? {
          companyId: runScopedIssue.companyId,
          executionWorkspacePolicy: runScopedIssue.projectExecutionWorkspacePolicy,
        }
      : null,
    issue: runScopedIssue
      ? {
          companyId: runScopedIssue.companyId,
          executionPolicy: runScopedIssue.executionPolicy,
        }
      : null,
    run: runExecutionPolicy ? { companyId: input.companyId, executionPolicy: runExecutionPolicy } : null,
  });
}

// Company-scope entrypoint for guards on routes with no issue in their path (e.g. the
// company knowledge document writes): looks up the acting agent, then resolves trust
// from the agent's permissions plus whatever issue/project/run policies the actor's
// current run is scoped to. Returns null for non-agent actors (board users are
// trusted reviewers) and for agents outside the company (assertCompanyAccess already
// rejects those).
export async function resolveActorTrustForCompanyScope(
  db: Db,
  actor: { type: string; agentId?: string | null; runId?: string | null },
  companyId: string,
): Promise<TrustPresetResolution | null> {
  if (actor.type !== "agent" || !actor.agentId) return null;
  const agent = await db
    .select({ id: agents.id, companyId: agents.companyId, permissions: agents.permissions })
    .from(agents)
    .where(eq(agents.id, actor.agentId))
    .then((rows) => rows[0] ?? null);
  if (!agent || agent.companyId !== companyId) return null;
  return resolveAgentRunScopedTrust({ db, companyId, agent, runId: actor.runId ?? null });
}
