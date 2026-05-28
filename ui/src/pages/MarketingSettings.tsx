import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "@/lib/router";
import { Megaphone } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { secretsApi } from "../api/secrets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const META_SECRET_KEY = "marketing-ai/meta/long_lived_token";
const GOOGLE_SECRET_KEY = "marketing-ai/google/refresh_token";

export function MarketingSettings() {
  const { t } = useTranslation("marketingSettingsPage");
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompany } = useCompany();
  const [searchParams] = useSearchParams();
  const oauthMeta = searchParams.get("meta");
  const oauthGoogle = searchParams.get("google");

  useEffect(() => {
    setBreadcrumbs([
      { label: t("breadcrumbInstanceSettings", "Instance Settings") },
      { label: t("breadcrumbMarketingAi", "Marketing AI") },
    ]);
  }, [setBreadcrumbs, t]);

  const secretsQuery = useQuery({
    queryKey: selectedCompany
      ? queryKeys.secrets.list(selectedCompany.id)
      : ["secrets-disabled"],
    queryFn: () =>
      selectedCompany ? secretsApi.list(selectedCompany.id) : Promise.resolve([]),
    enabled: !!selectedCompany,
  });

  const secrets = secretsQuery.data ?? [];
  const metaConnected =
    oauthMeta === "connected" ||
    secrets.some((s) => s.name === META_SECRET_KEY);
  const googleConnected =
    oauthGoogle === "connected" ||
    secrets.some((s) => s.name === GOOGLE_SECRET_KEY);

  function handleConnectMeta() {
    if (!selectedCompany) return;
    window.location.href = `/api/plugins/marketing-ai/oauth/meta/start?companyId=${selectedCompany.id}`;
  }

  function handleConnectGoogle() {
    if (!selectedCompany) return;
    window.location.href = `/api/plugins/marketing-ai/oauth/google/start?companyId=${selectedCompany.id}`;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("title", "Marketing AI")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", "Connect advertising accounts to enable the Marketing AI agent.")}
        </p>
      </div>

      {!selectedCompany && (
        <div className="text-sm text-muted-foreground">
          {t("selectCompany", "Select a company to manage Marketing AI connections.")}
        </div>
      )}

      {selectedCompany && (
        <div className="space-y-6">
          {/* Meta Ads */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">{t("metaAds", "Meta Ads")}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t("metaDescription", "Facebook & Instagram advertising via Marketing API.")}
                </p>
              </div>
              <Badge variant={metaConnected ? "default" : "outline"}>
                {metaConnected ? t("connected", "Connected") : t("notConnected", "Not connected")}
              </Badge>
            </div>
            <Button
              size="sm"
              variant={metaConnected ? "outline" : "default"}
              onClick={handleConnectMeta}
            >
              {metaConnected ? t("reconnectMeta", "Reconnect Meta") : t("connectMeta", "Connect Meta")}
            </Button>
          </div>

          {/* Google Ads */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">{t("googleAds", "Google Ads")}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t("googleDescription", "Search & Display campaigns via Google Ads API.")}
                </p>
              </div>
              <Badge variant={googleConnected ? "default" : "outline"}>
                {googleConnected ? t("connected", "Connected") : t("notConnected", "Not connected")}
              </Badge>
            </div>
            <Button
              size="sm"
              variant={googleConnected ? "outline" : "default"}
              onClick={handleConnectGoogle}
            >
              {googleConnected ? t("reconnectGoogle", "Reconnect Google") : t("connectGoogle", "Connect Google")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
