import { useTranslation } from "react-i18next";
import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "@/lib/router";

const items = [
  { value: "general", labelKey: "general", labelDefault: "General", href: "/company/settings" },
  { value: "environments", labelKey: "environments", labelDefault: "Environments", href: "/company/settings/environments" },
  { value: "access", labelKey: "access", labelDefault: "Access", href: "/company/settings/access" },
  { value: "invites", labelKey: "invites", labelDefault: "Invites", href: "/company/settings/invites" },
] as const;

type CompanySettingsTab = (typeof items)[number]["value"];

export function getCompanySettingsTab(pathname: string): CompanySettingsTab {
  if (pathname.includes("/company/settings/environments")) {
    return "environments";
  }

  if (pathname.includes("/company/settings/access")) {
    return "access";
  }

  if (pathname.includes("/company/settings/invites")) {
    return "invites";
  }

  return "general";
}

export function CompanySettingsNav() {
  const { t } = useTranslation("companySettingsNav");
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getCompanySettingsTab(location.pathname);

  function handleTabChange(value: string) {
    const nextTab = items.find((item) => item.value === value);
    if (!nextTab || nextTab.value === activeTab) return;
    navigate(nextTab.href);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageTabBar
        items={items.map(({ value, labelKey, labelDefault }) => ({ value, label: t(labelKey, labelDefault) }))}
        value={activeTab}
        onValueChange={handleTabChange}
        align="start"
      />
    </Tabs>
  );
}
