import { useState } from "react";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { CampaignCard } from "./CampaignCard.js";

type CampaignStatus = "all" | "live" | "paused" | "pending_approval" | "draft";

export interface CampaignRow {
  id: string;
  name: string;
  description?: string;
  platform: "meta" | "google";
  goal: string;
  status: string;
  budgetDailyPln: string;
  durationDays: number;
  createdAt: string;
  roas?: number;
}

export interface MarketingPageProps {
  companyId: string;
}

const FILTER_LABELS: Record<CampaignStatus, string> = {
  all: "All",
  live: "Live",
  paused: "Paused",
  pending_approval: "Awaiting approval",
  draft: "Draft",
};

const FILTERS: CampaignStatus[] = ["all", "live", "paused", "pending_approval", "draft"];

export function MarketingPage({ companyId }: MarketingPageProps) {
  const [filter, setFilter] = useState<CampaignStatus>("all");

  const { data: campaigns = [], loading: isLoading } = usePluginData<CampaignRow[]>(
    "marketing.campaigns",
    {
      companyId,
      status: filter === "all" ? undefined : filter,
    },
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: 0,
            color: "var(--foreground)",
          }}
        >
          {/* Megaphone SVG icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--primary)" }}
            aria-hidden="true"
          >
            <path d="m3 11 18-5v12L3 14v-3z" />
            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
          </svg>
          Marketing
        </h1>
      </header>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              borderRadius: "6px",
              padding: "4px 12px",
              fontSize: "13px",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              transition: "background 0.15s",
              background: filter === f ? "var(--primary)" : "var(--muted)",
              color: filter === f ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div
          style={{
            fontSize: "13px",
            color: "var(--muted-foreground)",
          }}
        >
          Loading campaigns...
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div
          style={{
            fontSize: "13px",
            color: "var(--muted-foreground)",
            padding: "32px 0",
            textAlign: "center",
          }}
        >
          No campaigns yet. Ask the Marketing AI agent to propose one.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "12px",
          }}
        >
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
