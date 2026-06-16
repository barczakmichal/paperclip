import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { GlowFrame } from "./GlowFrame";
import { LiveDot, type LiveDotStatus } from "./LiveDot";
import { LevelBadge } from "./LevelBadge";
import { StreakBadge } from "./StreakBadge";
import { EqualizerIndicator } from "./EqualizerIndicator";
import { CostTicker, type CostCurrency } from "./CostTicker";
import { ThoughtStream, type ThoughtLine } from "./ThoughtStream";
import { PlatformBadge, type AdPlatform } from "./PlatformBadge";

export type AgentBroadcastVariant = "compact" | "full" | "hero";

type Tag =
  | { kind: "platform"; platform: AdPlatform }
  | { kind: "text"; text: string; tone?: "neutral" | "warning" | "success" | "error" };

export interface AgentBroadcastCardProps {
  agent: { id: string; name: string; initials: string; color: string };
  status: LiveDotStatus;
  currentTask: string;
  currentTool?: string;
  cost: { value: number; cap?: number; currency: CostCurrency };
  level?: number;
  streakDays?: number;
  thoughts?: ThoughtLine[];
  tags?: Tag[];
  variant?: AgentBroadcastVariant;
  className?: string;
  onClick?: () => void;
}

const toneClass: Record<NonNullable<Extract<Tag, { kind: "text" }>["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-amber-500/20 text-amber-400",
  success: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

export function AgentBroadcastCard({
  agent,
  status,
  currentTask,
  currentTool,
  cost,
  level,
  streakDays,
  thoughts,
  tags,
  variant = "full",
  className,
  onClick,
}: AgentBroadcastCardProps) {
  const { t } = useTranslation("agentBroadcastCard");
  const showHeroDecor = variant === "hero";
  const showThoughts = (variant === "full" || variant === "hero") && thoughts && thoughts.length > 0;
  const showLevel = (variant === "full" || variant === "hero") && level !== undefined;
  const showStreak = (variant === "full" || variant === "hero") && streakDays !== undefined && streakDays > 0;
  const isActive = status === "active";

  const inner = (
    <div className={cn("flex flex-col gap-2 p-3", showHeroDecor && "p-4 gap-3")}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex items-center justify-center rounded-full font-bold text-white",
            showHeroDecor ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm",
          )}
          style={{ background: agent.color }}
        >
          {agent.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("font-semibold truncate", showHeroDecor ? "text-base" : "text-xs")}>
              {agent.name}
            </span>
            {showLevel && <LevelBadge level={level!} size="xs" />}
          </div>
          <div className="flex items-center gap-2">
            <LiveDot status={status} label={t(status, status)} pulse />
            {showStreak && <StreakBadge days={streakDays!} size="xs" />}
          </div>
        </div>
        <CostTicker value={cost.value} cap={cost.cap} currency={cost.currency} />
      </div>

      <div className={cn("font-medium", showHeroDecor ? "text-sm" : "text-xs")}>{currentTask}</div>

      {showThoughts && (
        <ThoughtStream
          lines={thoughts!}
          active={isActive}
          maxLines={showHeroDecor ? 12 : 4}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {currentTool && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {currentTool}
          </span>
        )}
        {tags?.map((t, i) =>
          t.kind === "platform" ? (
            <PlatformBadge key={i} platform={t.platform} />
          ) : (
            <span
              key={i}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight",
                toneClass[t.tone ?? "neutral"],
              )}
            >
              {t.text}
            </span>
          ),
        )}
        <div className="ml-auto">
          <EqualizerIndicator active={isActive} />
        </div>
      </div>
    </div>
  );

  return (
    <GlowFrame
      state={status === "active" ? "active" : status === "error" ? "error" : "idle"}
      className={cn(
        "bg-card transition-transform",
        onClick && "cursor-pointer hover:scale-[1.01]",
        className,
      )}
      onClick={onClick}
    >
      {inner}
    </GlowFrame>
  );
}
