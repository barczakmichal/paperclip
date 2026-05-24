import { cn } from "@/lib/utils";

export type CostCurrency = "USD" | "PLN" | "EUR";

const localeFor: Record<CostCurrency, string> = {
  USD: "en-US",
  PLN: "pl-PL",
  EUR: "de-DE",
};

function format(value: number, currency: CostCurrency): string {
  return new Intl.NumberFormat(localeFor[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface CostTickerProps {
  value: number;
  cap?: number;
  currency: CostCurrency;
  className?: string;
}

export function CostTicker({ value, cap, currency, className }: CostTickerProps) {
  return (
    <div className={cn("text-right", className)}>
      <div
        className="text-base font-extrabold leading-none"
        style={{
          background: "var(--grad-cost)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {format(value, currency)}
      </div>
      {cap !== undefined && (
        <div className="text-[9px] text-muted-foreground">
          / {format(cap, currency)} cap
        </div>
      )}
    </div>
  );
}
