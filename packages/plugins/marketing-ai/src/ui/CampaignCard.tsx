/** Inline variants of PlatformBadge and LiveDot — plugin bundles are isolated and cannot import from the host @/ paths. */

type AdPlatform = "meta" | "google";

const PLATFORM_STYLE: Record<AdPlatform, { background: string; label: string }> = {
  meta: { background: "#1877f2", label: "META" },
  google: { background: "#4285f4", label: "GOOGLE" },
};

function PlatformBadge({ platform }: { platform: AdPlatform }) {
  const p = PLATFORM_STYLE[platform];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "4px",
        padding: "2px 6px",
        fontSize: "9px",
        fontWeight: 800,
        letterSpacing: "-0.02em",
        background: p.background,
        color: "#ffffff",
      }}
    >
      {p.label}
    </span>
  );
}

type DotStatus = "active" | "idle" | "warning" | "success" | "error";

const DOT_COLOR: Record<DotStatus, string> = {
  active: "#22d3ee",   // cyan-400
  idle: "#737373",     // neutral-500
  warning: "#fbbf24",  // amber-400
  success: "#4ade80",  // green-400
  error: "#f87171",    // red-400
};

function LiveDot({ status, pulse }: { status: DotStatus; pulse?: boolean }) {
  const color = DOT_COLOR[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          animation: pulse && status === "active" ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : undefined,
        }}
      />
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  paused: "Paused",
  pending_approval: "Awaiting approval",
  draft: "Draft",
  rejected: "Rejected",
  rejected_by_platform: "Rejected by platform",
  expired: "Expired",
};

function statusToDotStatus(status: string): DotStatus {
  if (status === "live") return "active";
  if (status === "pending_approval") return "warning";
  if (status === "paused") return "idle";
  if (status === "rejected" || status === "rejected_by_platform") return "error";
  return "idle";
}

export interface CampaignRow {
  id: string;
  platform: "meta" | "google";
  goal: string;
  status: string;
  budgetDailyPln: string;
  durationDays: number;
  roas?: number;
}

export interface CampaignCardProps {
  campaign: CampaignRow;
  onClick?: () => void;
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const roasGood = campaign.roas !== undefined && campaign.roas >= 2;

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--card)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "color-mix(in srgb, var(--primary) 50%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
      }}
    >
      {/* Header: platform + status dot */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <PlatformBadge platform={campaign.platform} />
        <LiveDot
          status={statusToDotStatus(campaign.status)}
          pulse={campaign.status === "live"}
        />
      </div>

      {/* Goal */}
      <div
        style={{
          fontSize: "13px",
          fontWeight: 500,
          textTransform: "capitalize",
          color: "var(--foreground)",
        }}
      >
        {campaign.goal.replace(/_/g, " ")}
      </div>

      {/* Metrics row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          fontSize: "11px",
          color: "var(--muted-foreground)",
        }}
      >
        <span>
          <span
            style={{
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            {Number(campaign.budgetDailyPln).toFixed(0)} PLN
          </span>
          /day
        </span>
        <span>{campaign.durationDays}d</span>
        {campaign.roas !== undefined && (
          <span>
            ROAS{" "}
            <span
              style={{
                fontWeight: 600,
                color: roasGood ? "#4ade80" : "var(--foreground)",
              }}
            >
              {campaign.roas.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* Status label */}
      <div
        style={{
          fontSize: "11px",
          color: "var(--muted-foreground)",
        }}
      >
        {STATUS_LABEL[campaign.status] ?? campaign.status}
      </div>
    </div>
  );
}
