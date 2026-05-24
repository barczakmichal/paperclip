import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glowFrame = cva(
  "rounded-lg border transition-shadow",
  {
    variants: {
      state: {
        active: "border-primary/40 shadow-[var(--glow-active)]",
        idle: "border-border shadow-none",
        warning: "border-amber-500/40 shadow-[var(--glow-warning)]",
        success: "border-green-500/40 shadow-[var(--glow-success)]",
        error: "border-red-500/40 shadow-[var(--glow-error)]",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

export interface GlowFrameProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glowFrame> {
  state: NonNullable<VariantProps<typeof glowFrame>["state"]>;
}

export function GlowFrame({ state, className, children, ...rest }: GlowFrameProps) {
  return (
    <div data-glow-state={state} className={cn(glowFrame({ state }), className)} {...rest}>
      {children}
    </div>
  );
}
