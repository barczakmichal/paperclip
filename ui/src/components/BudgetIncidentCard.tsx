import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { BudgetIncident } from "@paperclipai/shared";
import { AlertOctagon, ArrowUpRight, PauseCircle } from "lucide-react";
import { formatCents } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GlowFrame } from "@/broadcast";

function centsInputValue(value: number) {
  return (value / 100).toFixed(2);
}

function parseDollarInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function incidentStateLabel(incident: BudgetIncident, t: TFunction) {
  if (incident.status === "resolved") return t("stateResolved", "Resolved");
  if (incident.status === "dismissed") return t("stateDismissed", "Dismissed");
  if (incident.approvalStatus === "revision_requested") return t("stateEscalated", "Escalated");
  if (incident.approvalStatus === "pending") return t("statePendingApproval", "Pending approval");
  return t("stateOpen", "Open");
}

export function BudgetIncidentCard({
  incident,
  onRaiseAndResume,
  onKeepPaused,
  isMutating,
}: {
  incident: BudgetIncident;
  onRaiseAndResume: (amountCents: number) => void;
  onKeepPaused: () => void;
  isMutating?: boolean;
}) {
  const { t } = useTranslation("budgetIncidentCard");
  const [draftAmount, setDraftAmount] = useState(
    centsInputValue(Math.max(incident.amountObserved + 1000, incident.amountLimit)),
  );
  const parsed = parseDollarInput(draftAmount);
  const stateLabel = incidentStateLabel(incident, t);

  return (
    <GlowFrame state="error" className="overflow-hidden">
    <Card className="overflow-hidden border-0 bg-card/80">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-red-200/80">
                {t("hardStop", "{{scope}} hard stop", { scope: incident.scopeType })}
              </div>
              <Badge variant={incident.status === "resolved" ? "outline" : "secondary"}>
                {stateLabel}
              </Badge>
            </div>
            <CardTitle className="mt-1 text-base text-red-50">{incident.scopeName}</CardTitle>
            <CardDescription className="mt-1 text-red-100/70">
              {t("spendingReached", "Spending reached {{observed}} against a limit of {{limit}}.", {
                observed: formatCents(incident.amountObserved),
                limit: formatCents(incident.amountLimit),
              })}
            </CardDescription>
          </div>
          <div className="rounded-full border border-red-400/30 bg-red-500/10 p-2 text-red-200">
            <AlertOctagon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5 pt-0">
        <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-50/90">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {incident.scopeType === "project"
              ? t("pausedProject", "Project execution is paused. New work in this project will not start until you resolve the budget incident.")
              : t("pausedScope", "This scope is paused. New heartbeats will not start until you resolve the budget incident.")}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/60 p-3">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("newBudgetLabel", "New budget (USD)")}
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Input
              value={draftAmount}
              onChange={(event) => setDraftAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            <Button
              className="gap-2"
              disabled={isMutating || parsed === null || parsed <= incident.amountObserved}
              onClick={() => {
                if (typeof parsed === "number") onRaiseAndResume(parsed);
              }}
            >
              <ArrowUpRight className="h-4 w-4" />
              {isMutating ? t("applying", "Applying...") : t("raiseAndResume", "Raise budget & resume")}
            </Button>
          </div>
          {parsed !== null && parsed <= incident.amountObserved ? (
            <p className="mt-2 text-xs text-red-200/80">
              {t("mustExceed", "The new budget must exceed current observed spend.")}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" className="text-muted-foreground" disabled={isMutating} onClick={onKeepPaused}>
            {t("keepPaused", "Keep paused")}
          </Button>
        </div>
      </CardContent>
    </Card>
    </GlowFrame>
  );
}
