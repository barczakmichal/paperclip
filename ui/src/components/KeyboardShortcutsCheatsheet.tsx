import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ShortcutEntry {
  keys: string[];
  label: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

function buildSections(t: TFunction): ShortcutSection[] {
  return [
    {
      title: t("inbox", "Inbox"),
      shortcuts: [
        { keys: ["j"], label: t("moveDown", "Move down") },
        { keys: ["↓"], label: t("moveDown", "Move down") },
        { keys: ["k"], label: t("moveUp", "Move up") },
        { keys: ["↑"], label: t("moveUp", "Move up") },
        { keys: ["←"], label: t("collapseGroup", "Collapse selected group") },
        { keys: ["→"], label: t("expandGroup", "Expand selected group") },
        { keys: ["Enter"], label: t("openItem", "Open selected item") },
        { keys: ["a"], label: t("archiveItem", "Archive item") },
        { keys: ["y"], label: t("archiveItem", "Archive item") },
        { keys: ["r"], label: t("markRead", "Mark as read") },
        { keys: ["U"], label: t("markUnread", "Mark as unread") },
      ],
    },
    {
      title: t("issueDetail", "Issue detail"),
      shortcuts: [
        { keys: ["y"], label: t("quickArchive", "Quick-archive back to inbox") },
        { keys: ["g", "i"], label: t("goToInbox", "Go to inbox") },
        { keys: ["g", "c"], label: t("focusComposer", "Focus comment composer") },
      ],
    },
    {
      title: t("global", "Global"),
      shortcuts: [
        { keys: ["/"], label: t("searchPage", "Search current page or quick search") },
        { keys: ["c"], label: t("newIssue", "New issue") },
        { keys: ["["], label: t("toggleSidebar", "Toggle sidebar") },
        { keys: ["]"], label: t("togglePanel", "Toggle panel") },
        { keys: ["?"], label: t("showShortcuts", "Show keyboard shortcuts") },
      ],
    },
  ];
}

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-[0_1px_0_1px_hsl(var(--border))]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  const { t } = useTranslation("keyboardShortcutsCheatsheet");
  const sections = buildSections(t);
  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.title} className="px-5 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{shortcut.label}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && <span className="text-xs text-muted-foreground">{t("then", "then")}</span>}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("pressPrefix", "Press")} <KeyCap>Esc</KeyCap> {t("toCloseSuffix", "to close · Shortcuts are disabled in text fields")}
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("keyboardShortcutsCheatsheet");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("title", "Keyboard shortcuts")}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
