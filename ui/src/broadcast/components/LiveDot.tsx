import { cn } from "@/lib/utils";

export type LiveDotStatus = "active" | "idle" | "warning" | "success" | "error";

const dotColor: Record<LiveDotStatus, string> = {
  active: "bg-cyan-400",
  idle: "bg-neutral-500",
  warning: "bg-amber-400",
  success: "bg-green-400",
  error: "bg-red-400",
};

const textColor: Record<LiveDotStatus, string> = {
  active: "text-cyan-400",
  idle: "text-neutral-500",
  warning: "text-amber-400",
  success: "text-green-400",
  error: "text-red-400",
};

export interface LiveDotProps {
  status: LiveDotStatus;
  label?: string;
  pulse?: boolean;
  className?: string;
}

export function LiveDot({ status, label, pulse, className }: LiveDotProps) {
  const active = status === "active";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", textColor[status], className)}>
      <span
        data-live-dot
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          dotColor[status],
          pulse && active && "animate-pulse",
        )}
      />
      {label && <span>{label}</span>}
    </span>
  );
}
