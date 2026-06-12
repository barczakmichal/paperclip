import { useState } from "react";
import { Languages, ChevronDown } from "lucide-react";
import { i18n, setLocale, supportedLocales, localeDisplayName } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const [currentLng, setCurrentLng] = useState(i18n.language);

  function handleChange(code: string) {
    setLocale(code);
    setCurrentLng(code);
  }

  const currentLabel = localeDisplayName(currentLng);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <Languages className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">{currentLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-36">
        <DropdownMenuRadioGroup value={currentLng} onValueChange={handleChange}>
          {supportedLocales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code}>
              {localeDisplayName(code)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
