import { memo } from "react";
import { Activity, ArrowRight, Wrench } from "lucide-react";
import type { LiveRunForIssue } from "../api/heartbeats";
import { cn } from "../lib/utils";

function isRunActive(run: LiveRunForIssue) {
  return run.status === "queued" || run.status === "running";
}

interface AgentActivitySummaryProps {
  run: LiveRunForIssue;
  className?: string;
}

export const AgentActivitySummary = memo(function AgentActivitySummary({
  run,
  className,
}: AgentActivitySummaryProps) {
  const active = isRunActive(run);
  const thought = run.currentThought?.trim() || null;
  const tool = run.currentTool?.trim() || null;
  const next = run.nextAction?.trim() || null;

  const nowText = thought ?? (active ? "Czeka na output..." : "Brak bieżącej aktywności");

  return (
    <div className={cn("flex flex-col gap-3 text-sm", className)}>
      <section className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Activity className={cn("h-3 w-3", active && "text-cyan-500")} />
          Teraz
        </span>
        <p className={cn("leading-snug", thought ? "text-foreground" : "text-muted-foreground")}>
          {nowText}
        </p>
      </section>

      {tool && (
        <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          <Wrench className="h-2.5 w-2.5" />
          {tool}
        </span>
      )}

      <section className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ArrowRight className="h-3 w-3" />
          Następny krok
        </span>
        <p className={cn("leading-snug", next ? "text-foreground" : "text-muted-foreground")}>
          {next ?? "—"}
        </p>
      </section>
    </div>
  );
});
