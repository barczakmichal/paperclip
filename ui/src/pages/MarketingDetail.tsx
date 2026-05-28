import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, Check, Image as ImageIcon, Megaphone, PauseCircle, Radio, X } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { marketingApi } from "../api/marketing";
import { approvalsApi } from "../api/approvals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn } from "../lib/utils";

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

const AUDIT_ACTION_LABEL: Record<string, { key: string; default: string }> = {
  "proposal.created": { key: "auditProposalCreated", default: "Proposal created" },
  "creative.generated": { key: "auditCreativeGenerated", default: "Creative generated" },
  "approval.submitted": { key: "auditApprovalSubmitted", default: "Submitted for approval" },
  "approval.approved": { key: "auditApprovalApproved", default: "Approved" },
  "approval.rejected": { key: "auditApprovalRejected", default: "Rejected" },
  "approval.revision_requested": { key: "auditRevisionRequested", default: "Revision requested" },
  "campaign.published": { key: "auditCampaignPublished", default: "Published to platform" },
  "campaign.paused": { key: "auditCampaignPaused", default: "Paused" },
  "cap.exceeded": { key: "auditCapExceeded", default: "Spend cap exceeded" },
};

function relativeTime(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return t("justNow", "just now");
  if (diff < 3_600_000) return t("minutesAgo", "{{count}}m ago", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("hoursAgo", "{{count}}h ago", { count: Math.floor(diff / 3_600_000) });
  return t("daysAgo", "{{count}}d ago", { count: Math.floor(diff / 86_400_000) });
}

export function MarketingDetail() {
  const { t } = useTranslation("marketingDetailPage");
  const queryClient = useQueryClient();
  const { selectedCompany } = useCompany();
  const { campaignId } = useParams<{ campaignId: string }>();
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketing.campaign", selectedCompany?.id, campaignId],
    queryFn: () => marketingApi.getCampaign(selectedCompany!.id, campaignId!),
    enabled: Boolean(selectedCompany && campaignId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["marketing.campaign", selectedCompany?.id, campaignId] });
    void queryClient.invalidateQueries({ queryKey: ["marketing.campaigns"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing.campaigns.dashboard"] });
  };

  const approveMutation = useMutation({
    mutationFn: (approvalId: string) => approvalsApi.approve(approvalId, decisionNote.trim() || undefined),
    onSuccess: () => {
      setDecisionNote("");
      setDecisionError(null);
      invalidate();
    },
    onError: (e: Error) => setDecisionError(e.message ?? t("approveFailed", "Approve failed")),
  });

  const rejectMutation = useMutation({
    mutationFn: (approvalId: string) => approvalsApi.reject(approvalId, decisionNote.trim() || undefined),
    onSuccess: () => {
      setDecisionNote("");
      setDecisionError(null);
      invalidate();
    },
    onError: (e: Error) => setDecisionError(e.message ?? t("rejectFailed", "Reject failed")),
  });

  const [pauseReason, setPauseReason] = useState("");
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const pauseMutation = useMutation({
    mutationFn: () => marketingApi.pauseCampaign(selectedCompany!.id, campaignId!, pauseReason.trim() || undefined),
    onSuccess: () => {
      setPauseReason("");
      setPauseError(null);
      setPauseOpen(false);
      invalidate();
    },
    onError: (e: Error) => setPauseError(e.message ?? t("pauseFailed", "Pause failed")),
  });

  if (!selectedCompany) {
    return <EmptyState icon={Megaphone} message={t("noWorkspace", "No active company workspace.")} />;
  }

  if (isLoading || !data) {
    if (error) {
      return (
        <EmptyState
          icon={Megaphone}
          message={t("loadError", "Could not load campaign: {{error}}", {
            error: String((error as Error).message ?? error),
          })}
        />
      );
    }
    return <PageSkeleton />;
  }

  const { campaign, creatives, auditLog } = data;
  const platform = PLATFORM_STYLE[campaign.platform] ?? { bg: "bg-neutral-700", label: campaign.platform.toUpperCase() };
  const dotClass = STATUS_DOT[campaign.status] ?? "bg-neutral-500";
  const isLive = campaign.status === "live";

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Link to={`/${selectedCompany.issuePrefix}/marketing`}>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("allCampaigns", "All campaigns")}
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider">{t("broadcast", "Broadcast")}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex items-center rounded px-2 py-1 text-[10px] font-extrabold tracking-tight text-white", platform.bg)}>
            {platform.label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", dotClass, isLive && "animate-pulse")} />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {STATUS_LABEL[campaign.status] ? t(STATUS_LABEL[campaign.status].key, STATUS_LABEL[campaign.status].default) : campaign.status}
            </span>
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {campaign.goal.replace(/_/g, " ")}
          </span>
        </div>

        <h1 className="text-2xl font-bold leading-tight">{campaign.name}</h1>
        {campaign.description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{campaign.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{Number(campaign.budgetDailyPln).toFixed(0)} PLN</span>
            {t("perDaySuffix", "/day")}
          </span>
          <span>
            <span className="font-semibold text-foreground">{campaign.durationDays}</span> {t("daysSuffix", "days")}
          </span>
          {campaign.platformCampaignId ? (
            <span>
              {t("platformId", "Platform ID:")} <span className="font-mono text-foreground">{campaign.platformCampaignId}</span>
            </span>
          ) : null}
          <span>{t("createdLabel", "Created {{time}}", { time: relativeTime(campaign.createdAt, t) })}</span>
          {campaign.publishedAt ? <span>{t("publishedLabel", "Published {{time}}", { time: relativeTime(campaign.publishedAt, t) })}</span> : null}
        </div>

        {campaign.audienceBrief ? (
          <Card className="max-w-3xl border-dashed p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("audienceBrief", "Audience brief")}
            </div>
            <div className="text-sm">{campaign.audienceBrief}</div>
          </Card>
        ) : null}

        {campaign.rejectionReason ? (
          <Card className="max-w-3xl border-red-400/30 bg-red-400/5 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
              {t("rejectionReason", "Rejection reason")}
            </div>
            <div className="text-sm">{campaign.rejectionReason}</div>
          </Card>
        ) : null}

        {campaign.status === "pending_approval" && campaign.approvalId ? (
          <Card className="flex max-w-3xl flex-col gap-3 border-amber-400/30 bg-amber-400/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              {t("decisionRequired", "Decision required")}
            </div>
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={t("decisionNotePlaceholder", "Optional note for the agent (visible in audit log)")}
              rows={2}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => approveMutation.mutate(campaign.approvalId!)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                {approveMutation.isPending ? t("approving", "Approving...") : t("approveAndPublish", "Approve & publish")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => rejectMutation.mutate(campaign.approvalId!)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                {rejectMutation.isPending ? t("rejecting", "Rejecting...") : t("reject", "Reject")}
              </Button>
            </div>
            {decisionError ? (
              <div className="text-xs text-red-400">{decisionError}</div>
            ) : null}
          </Card>
        ) : null}
        {campaign.status === "live" ? (
          pauseOpen ? (
            <Card className="flex max-w-3xl flex-col gap-3 border-neutral-500/30 bg-neutral-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pauseCampaign", "Pause campaign")}
              </div>
              <textarea
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder={t("pauseReasonPlaceholder", "Reason (visible in audit log) - optional")}
                rows={2}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                  className="gap-1.5"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  {pauseMutation.isPending ? t("pausing", "Pausing...") : t("confirmPause", "Confirm pause")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPauseOpen(false);
                    setPauseReason("");
                    setPauseError(null);
                  }}
                  disabled={pauseMutation.isPending}
                >
                  {t("cancel", "Cancel")}
                </Button>
              </div>
              {pauseError ? <div className="text-xs text-red-400">{pauseError}</div> : null}
            </Card>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setPauseOpen(true)} className="gap-1.5">
              <PauseCircle className="h-3.5 w-3.5" />
              {t("pauseCampaign", "Pause campaign")}
            </Button>
          )
        ) : null}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("creativesHeading", "Creatives ({{count}})", { count: creatives.length })}
        </h2>
        {creatives.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-40" />
            <span>{t("noCreatives", "No creatives yet. Agent will generate them via marketing.generate_creative.")}</span>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {creatives.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt={t("creativeAlt", "creative")} className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-muted/30">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{c.format.replace(/_/g, " ")}</span>
                    <span>{c.status}</span>
                  </div>
                  {c.headlines.length > 0 ? (
                    <div className="text-sm font-semibold">{c.headlines[0]}</div>
                  ) : null}
                  {c.bodies.length > 0 ? (
                    <div className="line-clamp-3 text-xs text-muted-foreground">{c.bodies[0]}</div>
                  ) : null}
                  {c.cta ? (
                    <div className="inline-block w-fit rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider">
                      {c.cta}
                    </div>
                  ) : null}
                  {c.errorDetail ? (
                    <div className="text-[10px] text-red-400">{c.errorDetail}</div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("auditLogHeading", "Audit log ({{count}})", { count: auditLog.length })}
        </h2>
        {auditLog.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("noAuditEntries", "No audit entries yet.")}</div>
        ) : (
          <Card className="p-0">
            <ol className="divide-y divide-border">
              {auditLog.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
                  <div className="flex flex-col">
                    <span className="font-medium">{AUDIT_ACTION_LABEL[entry.action] ? t(AUDIT_ACTION_LABEL[entry.action].key, AUDIT_ACTION_LABEL[entry.action].default) : entry.action}</span>
                    {entry.userId ? (
                      <span className="text-[10px] text-muted-foreground">{t("auditUser", "user {{id}}", { id: entry.userId.slice(0, 8) })}</span>
                    ) : entry.agentId ? (
                      <span className="text-[10px] text-muted-foreground">{t("auditAgent", "agent {{id}}", { id: entry.agentId.slice(0, 8) })}</span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{relativeTime(entry.createdAt, t)}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>
    </div>
  );
}
