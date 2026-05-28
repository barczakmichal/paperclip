import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IssueProductivityReview } from "@paperclipai/shared";
import { Link } from "../lib/router";
import { cn } from "../lib/utils";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

// Optional translator so the exported label helper can be reused outside React
// render. Falls back to the English defaultValue when no t is supplied.
type Translate = (key: string, defaultValue: string) => string;

const TRIGGER_LABELS: Record<string, { key: string; default: string }> = {
  no_comment_streak: { key: "triggerNoCommentStreak", default: "No-comment streak" },
  long_active_duration: { key: "triggerLongActiveDuration", default: "Long active duration" },
  high_churn: { key: "triggerHighChurn", default: "High churn" },
};

const REVIEW_STATUS_LABELS: Record<string, { key: string; default: string }> = {
  todo: { key: "statusOpen", default: "Open" },
  in_progress: { key: "statusInProgress", default: "In progress" },
  in_review: { key: "statusInReview", default: "In review" },
  blocked: { key: "statusBlocked", default: "Blocked" },
  backlog: { key: "statusOpen", default: "Open" },
};

export function productivityReviewTriggerLabel(
  trigger: IssueProductivityReview["trigger"],
  t: Translate = (_key, defaultValue) => defaultValue,
): string {
  if (!trigger) return t("productivityReview", "Productivity review");
  const entry = TRIGGER_LABELS[trigger];
  return entry ? t(entry.key, entry.default) : t("productivityReview", "Productivity review");
}

export function ProductivityReviewBadge({
  review,
  className,
  hideLabel = false,
}: {
  review: IssueProductivityReview;
  className?: string;
  hideLabel?: boolean;
}) {
  const { t } = useTranslation("productivityReviewBadge");
  const label = productivityReviewTriggerLabel(review.trigger, t);
  const reviewIdentifier = review.reviewIdentifier ?? review.reviewIssueId.slice(0, 8);
  const reviewPath = createIssueDetailPath(review.reviewIdentifier ?? review.reviewIssueId);
  const statusEntry = REVIEW_STATUS_LABELS[review.status];
  const statusLabel = statusEntry ? t(statusEntry.key, statusEntry.default) : review.status.replace(/_/g, " ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={reviewPath}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 shrink-0 hover:bg-amber-500/20 transition-colors",
            className,
          )}
          aria-label={t("ariaUnderReview", "Under review · productivity review {{identifier}} ({{label}})", { identifier: reviewIdentifier, label })}
        >
          <Eye className="h-3 w-3" aria-hidden />
          {hideLabel ? null : <span>{t("underReview", "Under review")}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          <div className="font-semibold">{t("productivityReviewOpen", "Productivity review open")}</div>
          <div>
            <span className="text-muted-foreground">{t("triggerLabel", "Trigger:")}</span> {label}
          </div>
          {typeof review.noCommentStreak === "number" && review.noCommentStreak > 0 ? (
            <div>
              <span className="text-muted-foreground">{t("noCommentStreakLabel", "No-comment streak:")}</span>{" "}
              {t("runsCount", "{{count}} runs", { count: review.noCommentStreak })}
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">{t("reviewLabel", "Review:")}</span> {reviewIdentifier} ({statusLabel})
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
