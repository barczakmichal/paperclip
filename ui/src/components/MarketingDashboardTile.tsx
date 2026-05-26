import { useQuery } from "@tanstack/react-query";
import { Megaphone, Radio } from "lucide-react";
import { Link } from "@/lib/router";
import { marketingApi, type MarketingCampaign } from "../api/marketing";
import { cn } from "../lib/utils";

interface Props {
  companyId: string;
}

const STATUS_DOT: Record<string, string> = {
  live: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]",
  pending_approval: "bg-amber-400",
  paused: "bg-neutral-500",
  draft: "bg-neutral-500",
};

function aggregateBudget(rows: MarketingCampaign[]): number {
  return rows.reduce((sum, r) => sum + Number(r.budgetDailyPln || "0"), 0);
}

export function MarketingDashboardTile({ companyId }: Props) {
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["marketing.campaigns.dashboard", companyId],
    queryFn: () => marketingApi.listCampaigns(companyId),
  });

  const live = campaigns.filter((c) => c.status === "live");
  const pending = campaigns.filter((c) => c.status === "pending_approval");
  const paused = campaigns.filter((c) => c.status === "paused");
  const draft = campaigns.filter((c) => c.status === "draft");
  const dailyBudget = aggregateBudget(live);
  const recent = [...campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Megaphone className="h-3.5 w-3.5" />
          Marketing
        </h2>
        <Link to="/marketing" className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <Radio className="h-3 w-3" />
          Open
        </Link>
      </header>

      {isLoading ? (
        <div className="mt-4 text-xs text-muted-foreground">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground">
          No campaigns yet. AI agents will propose them here.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric value={live.length} label="Live" accent="text-cyan-400" />
            <Metric value={pending.length} label="Awaiting" accent="text-amber-400" />
            <Metric value={`${dailyBudget.toFixed(0)} PLN`} label="Daily budget" />
          </div>

          {(paused.length > 0 || draft.length > 0) ? (
            <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              {paused.length} paused · {draft.length} draft
            </div>
          ) : null}

          <ol className="mt-4 flex flex-col gap-1.5">
            {recent.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/marketing/${c.id}`}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs no-underline text-inherit hover:bg-accent/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[c.status] ?? "bg-neutral-500", c.status === "live" && "animate-pulse")} />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {c.platform}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function Metric({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("text-xl font-semibold tabular-nums", accent ?? "text-foreground")}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
