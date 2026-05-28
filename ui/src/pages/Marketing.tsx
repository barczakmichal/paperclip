import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Radio, Megaphone } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { marketingApi, type MarketingCampaign } from "../api/marketing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn } from "../lib/utils";

type StatusFilter = "all" | "live" | "pending_approval" | "paused" | "draft";

const FILTERS: { value: StatusFilter; labelKey: string; labelDefault: string }[] = [
  { value: "all", labelKey: "filterAll", labelDefault: "All" },
  { value: "live", labelKey: "filterLive", labelDefault: "Live" },
  { value: "pending_approval", labelKey: "filterAwaitingApproval", labelDefault: "Awaiting approval" },
  { value: "paused", labelKey: "filterPaused", labelDefault: "Paused" },
  { value: "draft", labelKey: "filterDraft", labelDefault: "Draft" },
];

const STATUS_LABEL: Record<string, { key: string; default: string }> = {
  live: { key: "statusLive", default: "Live" },
  pending_approval: { key: "statusAwaitingApproval", default: "Awaiting approval" },
  paused: { key: "statusPaused", default: "Paused" },
  draft: { key: "statusDraft", default: "Draft" },
  rejected: { key: "statusRejected", default: "Rejected" },
  rejected_by_platform: { key: "statusRejectedByPlatform", default: "Rejected by platform" },
  expired: { key: "statusExpired", default: "Expired" },
};

const STATUS_DOT: Record<string, string> = {
  live: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]",
  pending_approval: "bg-amber-400",
  paused: "bg-neutral-500",
  draft: "bg-neutral-500",
  rejected: "bg-red-400",
  rejected_by_platform: "bg-red-400",
  expired: "bg-neutral-600",
};

const PLATFORM_STYLE: Record<string, { bg: string; label: string }> = {
  meta: { bg: "bg-[#1877f2]", label: "META" },
  google: { bg: "bg-[#4285f4]", label: "GOOGLE" },
};

function CampaignCard({ c, onClick }: { c: MarketingCampaign; onClick?: () => void }) {
  const { t } = useTranslation("marketingPage");
  const platform = PLATFORM_STYLE[c.platform] ?? { bg: "bg-neutral-700", label: c.platform.toUpperCase() };
  const dotClass = STATUS_DOT[c.status] ?? "bg-neutral-500";
  const isLive = c.status === "live";
  const roasGood = c.roas !== undefined && c.roas >= 2;
  const statusLabel = STATUS_LABEL[c.status];

  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex flex-col gap-3 p-4 transition-colors hover:border-primary/50",
        onClick && "cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-tight text-white", platform.bg)}>
          {platform.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", dotClass, isLive && "animate-pulse")} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {statusLabel ? t(statusLabel.key, statusLabel.default) : c.status}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold leading-tight text-foreground">{c.name}</div>
        {c.description ? (
          <div className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {c.description}
          </div>
        ) : null}
      </div>

      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {c.goal.replace(/_/g, " ")}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{Number(c.budgetDailyPln).toFixed(0)} PLN</span>
          {t("perDaySuffix", "/day")}
        </span>
        <span>{c.durationDays}d</span>
        {c.roas !== undefined ? (
          <span>
            ROAS{" "}
            <span className={cn("font-semibold", roasGood ? "text-green-400" : "text-foreground")}>
              {c.roas.toFixed(2)}
            </span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function Marketing() {
  const { t } = useTranslation("marketingPage");
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: campaigns = [], isLoading, error, refetch } = useQuery({
    queryKey: ["marketing.campaigns", selectedCompany?.id, filter],
    queryFn: () => {
      if (!selectedCompany) return Promise.resolve([] as MarketingCampaign[]);
      return marketingApi.listCampaigns(selectedCompany.id, filter === "all" ? undefined : filter);
    },
    enabled: Boolean(selectedCompany),
  });

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: campaigns.length };
    for (const c of campaigns) acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, [campaigns]);

  if (!selectedCompany) {
    return (
      <EmptyState
        icon={Megaphone}
        message={t("requiresWorkspace", "Marketing AI requires an active company workspace.")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Megaphone className="h-5 w-5" />
          {t("title", "Marketing")}
        </h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="h-3.5 w-3.5" />
          <span className="uppercase tracking-wider">{t("broadcast", "Broadcast")}</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = counts[f.value] ?? 0;
          return (
            <Button
              key={f.value}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
              className="h-7 text-xs"
            >
              {t(f.labelKey, f.labelDefault)}
              {f.value === "all" || count > 0 ? (
                <span className={cn("ml-1.5 text-[10px]", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
              ) : null}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : error ? (
        <EmptyState
          icon={Megaphone}
          message={t("loadError", "Could not load campaigns: {{error}}", {
            error: String((error as Error).message ?? error),
          })}
          action={t("retry", "Retry")}
          onAction={() => void refetch()}
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          message={
            filter === "all"
              ? t("emptyAll", "No campaigns yet. Marketing AI agents will propose them here once configured.")
              : t("emptyFiltered", 'No campaigns with status "{{status}}".', {
                  status: STATUS_LABEL[filter] ? t(STATUS_LABEL[filter].key, STATUS_LABEL[filter].default) : filter,
                })
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              c={c}
              onClick={() => void navigate(`/${selectedCompany.issuePrefix}/marketing/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
