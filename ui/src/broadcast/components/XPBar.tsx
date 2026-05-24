import { cn } from "@/lib/utils";

export interface XPBarProps {
  current: number;
  target: number;
  label?: string;
  className?: string;
}

export function XPBar({ current, target, label, className }: XPBarProps) {
  const pct = Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0));
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
          {label}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-xp-fill
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "var(--xp-bar-fill)",
          }}
        />
      </div>
    </div>
  );
}
