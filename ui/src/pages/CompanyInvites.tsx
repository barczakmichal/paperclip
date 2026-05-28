import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, MailPlus } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

type InviteRoleOption = {
  value: "viewer" | "operator" | "admin" | "owner";
  label: string;
  description: string;
  gets: string;
};

function buildInviteRoleOptions(t: (key: string, defaultValue: string) => string): InviteRoleOption[] {
  return [
    {
      value: "viewer",
      label: t("roleViewerLabel", "Viewer"),
      description: t("roleViewerDescription", "Can view company work and follow along without operational permissions."),
      gets: t("roleViewerGets", "No built-in grants."),
    },
    {
      value: "operator",
      label: t("roleOperatorLabel", "Operator"),
      description: t("roleOperatorDescription", "Recommended for people who need to help run work without managing access."),
      gets: t("roleOperatorGets", "Can assign tasks."),
    },
    {
      value: "admin",
      label: t("roleAdminLabel", "Admin"),
      description: t("roleAdminDescription", "Recommended for operators who need to invite people, create agents, and approve joins."),
      gets: t("roleAdminGets", "Can create agents, invite users, assign tasks, and approve join requests."),
    },
    {
      value: "owner",
      label: t("roleOwnerLabel", "Owner"),
      description: t("roleOwnerDescription", "Full company access, including membership and permission management."),
      gets: t("roleOwnerGets", "Everything in Admin, plus managing members and permission grants."),
    },
  ];
}

const INVITE_HISTORY_PAGE_SIZE = 5;

function isInviteHistoryRow(value: unknown): value is Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number] {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "state" in value && "createdAt" in value;
}

export function CompanyInvites() {
  const { t } = useTranslation("companyInvitesPage");
  const inviteRoleOptions = useMemo(() => buildInviteRoleOptions(t), [t]);
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [humanRole, setHumanRole] = useState<"owner" | "admin" | "operator" | "viewer">("operator");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteCopied, setLatestInviteCopied] = useState(false);

  useEffect(() => {
    if (!latestInviteCopied) return;
    const timeout = window.setTimeout(() => {
      setLatestInviteCopied(false);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [latestInviteCopied]);

  async function copyInviteUrl(url: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fall through to the unavailable message below.
    }

    pushToast({
      title: t("clipboardUnavailable", "Clipboard unavailable"),
      body: t("clipboardUnavailableBody", "Copy the invite URL manually from the field below."),
      tone: "warn",
    });
    return false;
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("companyFallback", "Company"), href: "/dashboard" },
      { label: t("settingsBreadcrumb", "Settings"), href: "/company/settings" },
      { label: t("invitesBreadcrumb", "Invites") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const inviteHistoryQueryKey = queryKeys.access.invites(selectedCompanyId ?? "", "all", INVITE_HISTORY_PAGE_SIZE);
  const invitesQuery = useInfiniteQuery({
    queryKey: inviteHistoryQueryKey,
    queryFn: ({ pageParam }) =>
      accessApi.listInvites(selectedCompanyId!, {
        limit: INVITE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const inviteHistory = useMemo(
    () =>
      invitesQuery.data?.pages.flatMap((page) =>
        Array.isArray(page?.invites) ? page.invites.filter(isInviteHistoryRow) : [],
      ) ?? [],
    [invitesQuery.data?.pages],
  );

  const createInviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        humanRole,
        agentMessage: null,
      }),
    onSuccess: async (invite) => {
      setLatestInviteUrl(invite.inviteUrl);
      setLatestInviteCopied(false);
      const copied = await copyInviteUrl(invite.inviteUrl);

      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({
        title: t("toastInviteCreated", "Invite created"),
        body: copied ? t("toastInviteReadyCopied", "Invite ready below and copied to clipboard.") : t("toastInviteReady", "Invite ready below."),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("toastInviteCreateFailed", "Failed to create invite"),
        body: error instanceof Error ? error.message : t("unknownError", "Unknown error"),
        tone: "error",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => accessApi.revokeInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({ title: t("toastInviteRevoked", "Invite revoked"), tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: t("toastInviteRevokeFailed", "Failed to revoke invite"),
        body: error instanceof Error ? error.message : t("unknownError", "Unknown error"),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("selectCompany", "Select a company to manage invites.")}</div>;
  }

  if (invitesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loading", "Loading invites…")}</div>;
  }

  if (invitesQuery.error) {
    const message =
      invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403
        ? t("noPermission", "You do not have permission to manage company invites.")
        : invitesQuery.error instanceof Error
          ? invitesQuery.error.message
          : t("loadFailed", "Failed to load invites.");
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("title", "Company Invites")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("subtitle", "Create human invite links for company access. New invite links are copied to your clipboard when they are generated.")}
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("createInviteHeading", "Create invite")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("createInviteSubtitle", "Generate a human invite link and choose the default access it should request.")}
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("chooseRole", "Choose a role")}</legend>
          <div className="rounded-xl border border-border">
            {inviteRoleOptions.map((option, index) => {
              const checked = humanRole === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={option.value}
                    checked={checked}
                    onChange={() => setHumanRole(option.value)}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.value === "operator" ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {t("defaultBadge", "Default")}
                        </span>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{option.description}</span>
                    <span className="block text-sm text-foreground">{option.gets}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          {t("singleUseNotice", "Each invite link is single-use. The first successful use consumes the link and creates or reuses the matching join request before approval.")}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending ? t("creating", "Creating…") : t("createInviteButton", "Create invite")}
          </Button>
          <span className="text-sm text-muted-foreground">{t("auditTrailNote", "Invite history below keeps the audit trail.")}</span>
        </div>

        {latestInviteUrl ? (
          <div className="space-y-3 rounded-lg border border-border px-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{t("latestInviteLink", "Latest invite link")}</div>
                {latestInviteCopied ? (
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <Check className="h-3.5 w-3.5" />
                    {t("copied", "Copied")}
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("urlIncludesDomain", "This URL includes the current Paperclip domain returned by the server.")}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyInviteUrl(latestInviteUrl);
                setLatestInviteCopied(copied);
              }}
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all transition-colors hover:bg-background"
            >
              {latestInviteUrl}
            </button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={latestInviteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {t("openInvite", "Open invite")}
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t("inviteHistoryHeading", "Invite history")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("inviteHistorySubtitle", "Review invite status, role, inviter, and any linked join request.")}
            </p>
          </div>
          <Link to="/inbox/requests" className="text-sm underline underline-offset-4">
            {t("openJoinQueue", "Open join request queue")}
          </Link>
        </div>

        {inviteHistory.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
            {t("noInvites", "No invites have been created for this company yet.")}
          </div>
        ) : (
          <div className="border-t border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("colState", "State")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("colRole", "Role")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("colInvitedBy", "Invited by")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("colCreated", "Created")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("colJoinRequest", "Join request")}</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">{t("colAction", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map((invite) => (
                    <tr key={invite.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 align-top">
                        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {formatInviteState(invite.state)}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">{invite.humanRole ?? "—"}</td>
                      <td className="px-5 py-3 align-top">
                        <div>{invite.invitedByUser?.name || invite.invitedByUser?.email || t("unknownInviter", "Unknown inviter")}</div>
                        {invite.invitedByUser?.email && invite.invitedByUser.name ? (
                          <div className="text-xs text-muted-foreground">{invite.invitedByUser.email}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.relatedJoinRequestId ? (
                          <Link to="/inbox/requests" className="underline underline-offset-4">
                            {t("reviewRequest", "Review request")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        {invite.state === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending}
                          >
                            {t("revoke", "Revoke")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("inactive", "Inactive")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitesQuery.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invitesQuery.fetchNextPage()}
                  disabled={invitesQuery.isFetchingNextPage}
                >
                  {invitesQuery.isFetchingNextPage ? t("loadingMore", "Loading more…") : t("viewMore", "View more")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function formatInviteState(state: "active" | "accepted" | "expired" | "revoked") {
  return state.charAt(0).toUpperCase() + state.slice(1);
}
