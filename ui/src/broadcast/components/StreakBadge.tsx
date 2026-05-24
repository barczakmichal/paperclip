import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreakBadgeProps {
  days: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const sizes = {
  xs: { container: "text-[9px] px-1 py-px", icon: 8 },
  sm: { container: "text-[10px] px-1.5 py-0.5", icon: 10 },
  md: { container: "text-xs px-2 py-1", icon: 12 },
};

export function StreakBadge({ days, size = "sm", className }: StreakBadgeProps) {
  const s = sizes[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded font-bold uppercase tracking-tight",
        s.container,
        className,
      )}
      style={{
        background: "var(--streak-flame)",
        color: "white",
      }}
    >
      {days >= 1 && <Flame data-streak-flame size={s.icon} />}
      streak {days}d
    </span>
  );
}
