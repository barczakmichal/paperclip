import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Resources are auto-loaded from ui/src/locales/<lng>/<namespace>.json.
// Each area owns its own namespace file so translation work can be split
// without file collisions. Components call t("namespace:key", "English default")
// — the English default keeps tests (which run in English) green and acts as a
// graceful fallback for any key not yet translated.
const modules = import.meta.glob<{ default: Record<string, unknown> }>(
  "../locales/*/*.json",
  { eager: true },
);

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [filePath, mod] of Object.entries(modules)) {
  const match = filePath.match(/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, namespace] = match;
  resources[lng] ??= {};
  resources[lng][namespace] = (mod as { default: Record<string, unknown> }).default;
}

const namespaces = Array.from(
  new Set(Object.values(resources).flatMap((byNs) => Object.keys(byNs))),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: "pl",
  fallbackLng: "en",
  ns: namespaces.length > 0 ? namespaces : ["common"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  // Missing keys fall back to the English defaultValue passed at call sites.
});

export default i18n;
