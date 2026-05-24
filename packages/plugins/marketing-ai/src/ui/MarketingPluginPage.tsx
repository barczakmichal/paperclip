import { type PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { MarketingPage } from "./MarketingPage.js";

export function MarketingPluginPage({ context }: PluginPageProps) {
  const companyId = context.companyId ?? "";
  return <MarketingPage companyId={companyId} />;
}
