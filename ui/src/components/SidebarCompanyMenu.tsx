import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Settings, UserPlus } from "lucide-react";
import { Link } from "@/lib/router";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import { useSidebar } from "../context/SidebarContext";

interface SidebarCompanyMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SidebarCompanyMenu({ open: controlledOpen, onOpenChange }: SidebarCompanyMenuProps = {}) {
  const { t } = useTranslation("sidebarCompanyMenu");
  const [internalOpen, setInternalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { selectedCompany } = useCompany();
  const { isMobile, setSidebarOpen } = useSidebar();
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const signOutMutation = useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: async () => {
      setOpen(false);
      if (isMobile) setSidebarOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    },
  });

  function closeNavigationChrome() {
    setOpen(false);
    if (isMobile) setSidebarOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto flex-1 justify-start gap-1 px-2 py-1.5 text-left"
          aria-label={selectedCompany ? t("openCompanyMenuNamed", "Open {{name}} menu", { name: selectedCompany.name }) : t("openCompanyMenu", "Open company menu")}
          disabled={!selectedCompany}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selectedCompany?.brandColor ? (
              <span
                className="size-4 shrink-0 rounded-sm"
                style={{ backgroundColor: selectedCompany.brandColor }}
              />
            ) : null}
            <span className="truncate text-sm font-bold text-foreground">
              {selectedCompany?.name ?? t("selectCompany", "Select company")}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="truncate">
          {selectedCompany?.name ?? t("company", "Company")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/company/settings/invites" onClick={closeNavigationChrome}>
            <UserPlus className="size-4" />
            <span className="truncate">
              {selectedCompany ? t("invitePeopleTo", "Invite people to {{name}}", { name: selectedCompany.name }) : t("invitePeople", "Invite people")}
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/company/settings" onClick={closeNavigationChrome}>
            <Settings className="size-4" />
            <span>{t("companySettings", "Company settings")}</span>
          </Link>
        </DropdownMenuItem>
        {session?.session ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              <LogOut className="size-4" />
              <span>{signOutMutation.isPending ? t("signingOut", "Signing out...") : t("signOut", "Sign out")}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
