import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { ChevronRight, Workflow, Ban, Activity } from "lucide-react";
import { Link } from "@/lib/router";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { Identity } from "../components/Identity";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn } from "../lib/utils";

const TERMINAL_STATUSES = new Set(["done", "cancelled", "archived"]);

function isRunActive(run: LiveRunForIssue) {
  return run.status === "queued" || run.status === "running";
}

export function Process() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Proces" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "process"],
    queryFn: () => issuesApi.list(selectedCompanyId!, { includeBlockedBy: true }),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId!), "process"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!, { minCount: 0, limit: 50 }),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents ?? []) map.set(a.id, a.name);
    return map;
  }, [agents]);

  const activeRunByIssueId = useMemo(() => {
    const map = new Map<string, LiveRunForIssue>();
    for (const run of liveRuns ?? []) {
      if (run.issueId && isRunActive(run)) map.set(run.issueId, run);
    }
    return map;
  }, [liveRuns]);

  const { roots, childrenByParent } = useMemo(() => {
    const all = issues ?? [];
    const ids = new Set(all.map((i) => i.id));
    const children = new Map<string, Issue[]>();
    const top: Issue[] = [];
    for (const issue of all) {
      if (issue.parentId && ids.has(issue.parentId)) {
        const arr = children.get(issue.parentId) ?? [];
        arr.push(issue);
        children.set(issue.parentId, arr);
      } else {
        top.push(issue);
      }
    }
    const byIdentifier = (a: Issue, b: Issue) =>
      (a.identifier ?? "").localeCompare(b.identifier ?? "", undefined, { numeric: true });
    top.sort(byIdentifier);
    for (const arr of children.values()) arr.sort(byIdentifier);
    return { roots: top, childrenByParent: children };
  }, [issues]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Workflow} message="Wybierz firmę, aby zobaczyć proces." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (!issues || issues.length === 0) {
    return <EmptyState icon={Workflow} message="Brak zadań. Proces pojawi się, gdy agenci zaczną pracę." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Proces</h1>
          <p className="text-sm text-muted-foreground">
            Hierarchia zadań firmy z bieżącą aktywnością agentów i zależnościami.
          </p>
        </div>
        <Link
          to="/live"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <Activity className="h-3.5 w-3.5" /> Live Ops
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {roots.map((root) => (
          <ProcessNode
            key={root.id}
            issue={root}
            depth={0}
            childrenByParent={childrenByParent}
            agentNameById={agentNameById}
            activeRunByIssueId={activeRunByIssueId}
          />
        ))}
      </div>
    </div>
  );
}

function ProcessNode({
  issue,
  depth,
  childrenByParent,
  agentNameById,
  activeRunByIssueId,
}: {
  issue: Issue;
  depth: number;
  childrenByParent: Map<string, Issue[]>;
  agentNameById: Map<string, string>;
  activeRunByIssueId: Map<string, LiveRunForIssue>;
}) {
  const children = childrenByParent.get(issue.id) ?? [];
  const run = activeRunByIssueId.get(issue.id);
  const agentName = issue.assigneeAgentId ? agentNameById.get(issue.assigneeAgentId) : null;
  const blockedByCount = issue.blockedBy?.length ?? 0;
  const dimmed = TERMINAL_STATUSES.has(issue.status);

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-2 border-b border-border/60 px-3 py-2.5 hover:bg-accent/40",
          dimmed && "opacity-60",
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {depth > 0 && <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          <StatusIcon status={issue.status} />
          <PriorityIcon priority={issue.priority} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/issues/${issue.identifier ?? issue.id}`}
              className="min-w-0 truncate text-sm hover:underline"
              title={issue.title}
            >
              <span className="font-mono text-xs text-muted-foreground">{issue.identifier ?? issue.id.slice(0, 8)}</span>{" "}
              {issue.title}
            </Link>
            {run && (
              <span className="relative flex h-2 w-2 shrink-0" title="Agent pracuje teraz">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
            )}
          </div>

          {run?.currentThought && (
            <p className="mt-1 line-clamp-1 text-xs text-cyan-700 dark:text-cyan-300">
              Teraz: {run.currentThought}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {agentName && <Identity name={agentName} size="sm" className="[&>span:last-child]:!text-[11px]" />}
            {blockedByCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Ban className="h-3 w-3" /> zablokowane przez {blockedByCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {children.map((child) => (
        <ProcessNode
          key={child.id}
          issue={child}
          depth={depth + 1}
          childrenByParent={childrenByParent}
          agentNameById={agentNameById}
          activeRunByIssueId={activeRunByIssueId}
        />
      ))}
    </>
  );
}
