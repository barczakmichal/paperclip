import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { INSTANCE_SETTINGS_PATH_PREFIX } from "@/lib/instance-settings";
import { useLocation, useNavigate } from "@/lib/router";
import { useTranslation } from "@/i18n";

const ITEMS_DEFINITION = [
  { value: "general", label: "General", href: "/company/settings" },
  { value: "environments", label: "Environments", href: "/company/settings/environments" },
  { value: "cloud-upstream", label: "Cloud upstream", href: "/company/settings/cloud-upstream" },
  { value: "members", label: "Members", href: "/company/settings/members" },
  { value: "invites", label: "Invites", href: "/company/settings/invites" },
  { value: "secrets", label: "Secrets", href: "/company/settings/secrets" },
  { value: "instance-profile", label: "Instance profile", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/profile` },
  { value: "instance-general", label: "Instance general", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/general` },
  { value: "instance-access", label: "Instance access", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/access` },
  { value: "instance-heartbeats", label: "Instance heartbeats", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/heartbeats` },
  { value: "instance-experimental", label: "Instance experimental", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/experimental` },
  { value: "instance-plugins", label: "Instance plugins", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/plugins` },
  { value: "instance-adapters", label: "Instance adapters", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/adapters` },
] as const;

type CompanySettingsTab = (typeof ITEMS_DEFINITION)[number]["value"];

export function getCompanySettingsTab(pathname: string): CompanySettingsTab {
  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/profile`)) {
    return "instance-profile";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/access`)) {
    return "instance-access";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/heartbeats`)) {
    return "instance-heartbeats";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/experimental`)) {
    return "instance-experimental";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/plugins`)) {
    return "instance-plugins";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/adapters`)) {
    return "instance-adapters";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/general`)) {
    return "instance-general";
  }

  if (pathname.includes("/company/settings/environments")) {
    return "environments";
  }

  if (pathname.includes("/company/settings/cloud-upstream")) {
    return "cloud-upstream";
  }

  if (pathname.includes("/company/settings/members") || pathname.includes("/company/settings/access")) {
    return "members";
  }

  if (pathname.includes("/company/settings/invites")) {
    return "invites";
  }

  if (pathname.includes("/company/settings/secrets")) {
    return "secrets";
  }

  return "general";
}

export function CompanySettingsNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getCompanySettingsTab(location.pathname);

  const items = [
    { value: "general", label: t("nav.sidebar.companySettings.general"), href: "/company/settings" },
    { value: "environments", label: t("nav.sidebar.companySettings.environments"), href: "/company/settings/environments" },
    { value: "cloud-upstream", label: "Cloud upstream", href: "/company/settings/cloud-upstream" },
    { value: "members", label: "Members", href: "/company/settings/members" },
    { value: "invites", label: t("nav.sidebar.companySettings.invites"), href: "/company/settings/invites" },
    { value: "secrets", label: t("nav.sidebar.companySettings.secrets"), href: "/company/settings/secrets" },
    { value: "instance-profile", label: "Instance profile", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/profile` },
    { value: "instance-general", label: "Instance general", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/general` },
    { value: "instance-access", label: "Instance access", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/access` },
    { value: "instance-heartbeats", label: "Instance heartbeats", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/heartbeats` },
    { value: "instance-experimental", label: "Instance experimental", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/experimental` },
    { value: "instance-plugins", label: "Instance plugins", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/plugins` },
    { value: "instance-adapters", label: "Instance adapters", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/adapters` },
  ] as const;

  function handleTabChange(value: string) {
    const nextTab = items.find((item) => item.value === value);
    if (!nextTab || nextTab.value === activeTab) return;
    navigate(nextTab.href);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageTabBar
        items={items.map(({ value, label }) => ({ value, label }))}
        value={activeTab}
        onValueChange={handleTabChange}
        align="start"
      />
    </Tabs>
  );
}
