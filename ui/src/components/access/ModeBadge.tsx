import { useTranslation } from "react-i18next";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";

export function ModeBadge({
  deploymentMode,
  deploymentExposure,
}: {
  deploymentMode?: DeploymentMode;
  deploymentExposure?: DeploymentExposure;
}) {
  const { t } = useTranslation("modeBadge");
  if (!deploymentMode) return null;

  const label =
    deploymentMode === "local_trusted"
      ? t("localTrusted", "Local trusted")
      : t("authenticated", "Authenticated {{exposure}}", { exposure: deploymentExposure ?? "private" });

  return <Badge variant="outline">{label}</Badge>;
}
