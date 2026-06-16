import { cn } from "@/lib/utils";

export interface MissionCardProps {
  title: string;
  progress: number;
  tasks?: { done: number; total: number };
  reward?: string;
  className?: string;
  onClick?: () => void;
}

export function MissionCard({ title, progress, tasks, reward, className, onClick }: MissionCardProps) {
  const pct = Math.max(0, Math.min(100, progress * 100));
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {reward && (
          <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
            {reward}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-mission-progress
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {tasks && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {tasks.done} / {tasks.total} tasks
        </div>
      )}
    </button>
  );
}
