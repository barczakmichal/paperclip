import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const levelBadge = cva(
  "inline-flex items-center justify-center rounded font-extrabold tracking-tight uppercase text-white",
  {
    variants: {
      size: {
        xs: "px-1 py-px text-[9px]",
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-1 text-xs",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface LevelBadgeProps extends VariantProps<typeof levelBadge> {
  level: number;
  className?: string;
}

export function LevelBadge({ level, size, className }: LevelBadgeProps) {
  return (
    <span
      data-level-badge
      className={cn(levelBadge({ size }), className)}
      style={{ background: "var(--level-badge)" }}
    >
      LVL {level}
    </span>
  );
}
