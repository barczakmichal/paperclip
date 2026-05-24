import { useState } from "react";
import type { MarketingCampaignApprovalPayload } from "../approval/payload.js";

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

type ButtonVariant = "primary" | "outline" | "destructive" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "1px solid transparent",
  },
  outline: {
    background: "transparent",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
  },
  destructive: {
    background: "var(--destructive)",
    color: "var(--destructive-foreground, #fff)",
    border: "1px solid transparent",
  },
  ghost: {
    background: "transparent",
    color: "var(--muted-foreground)",
    border: "1px solid transparent",
  },
};

function ActionButton({
  onClick,
  disabled,
  variant = "outline",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...BUTTON_STYLES[variant],
        borderRadius: "6px",
        padding: "5px 12px",
        fontSize: "12px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}

export interface CreativePreviewData {
  id: string;
  imageUrl?: string | null;
  headlines: string[];
  bodies: string[];
  cta?: string | null;
}

export interface Approval {
  id: string;
  type: string;
  status: string;
  payload: MarketingCampaignApprovalPayload;
}

export interface CampaignApprovalCardProps {
  approval: Approval;
  creatives?: CreativePreviewData[];
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string, reason: string) => void;
  onRevision: (approvalId: string, note: string) => void;
}

type Mode = "idle" | "reject" | "revision";

export function CampaignApprovalCard({
  approval,
  creatives = [],
  onApprove,
  onReject,
  onRevision,
}: CampaignApprovalCardProps) {
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const meta = approval.payload;

  function handleConfirm() {
    if (mode === "reject") {
      onReject(approval.id, note);
    } else if (mode === "revision") {
      onRevision(approval.id, note);
    }
    setMode("idle");
    setNote("");
  }

  function handleCancel() {
    setMode("idle");
    setNote("");
  }

  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--card)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <PlatformBadge platform={meta.platform as AdPlatform} />
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              textTransform: "capitalize",
              color: "var(--foreground)",
            }}
          >
            {meta.goal}
          </span>
        </div>
        <span
          style={{
            fontSize: "11px",
            color: "var(--muted-foreground)",
          }}
        >
          {Number(meta.budgetDailyPln).toFixed(0)} PLN/day × {meta.durationDays}d
        </span>
      </div>

      {/* Creative thumbnails */}
      {creatives.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "4px",
          }}
        >
          {creatives.map((c) => (
            <div
              key={c.id}
              style={{
                flexShrink: 0,
                width: "80px",
                height: "80px",
                borderRadius: "6px",
                background: "var(--muted)",
                overflow: "hidden",
              }}
            >
              {c.imageUrl ? (
                <img
                  src={c.imageUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    color: "var(--muted-foreground)",
                  }}
                >
                  No img
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Audience brief */}
      {meta.audienceBrief && (
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "var(--muted-foreground)",
          }}
        >
          {meta.audienceBrief}
        </p>
      )}

      {/* Agent comments */}
      {meta.comments && (
        <blockquote
          style={{
            borderLeft: "2px solid var(--border)",
            paddingLeft: "12px",
            margin: 0,
            fontSize: "12px",
            fontStyle: "italic",
            color: "var(--muted-foreground)",
          }}
        >
          {meta.comments}
        </blockquote>
      )}

      {/* Note textarea for rejection / revision */}
      {mode !== "idle" && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            mode === "reject"
              ? "Reason for rejection..."
              : "What should be revised..."
          }
          rows={3}
          style={{
            width: "100%",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            padding: "8px",
            fontSize: "13px",
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {mode === "idle" ? (
          <>
            <ActionButton
              variant="primary"
              onClick={() => onApprove(approval.id)}
            >
              Approve &amp; Publish
            </ActionButton>
            <ActionButton
              variant="outline"
              onClick={() => setMode("revision")}
            >
              Request Revision
            </ActionButton>
            <ActionButton
              variant="destructive"
              onClick={() => setMode("reject")}
            >
              Reject
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton
              variant={mode === "reject" ? "destructive" : "primary"}
              disabled={!note.trim()}
              onClick={handleConfirm}
            >
              Confirm
            </ActionButton>
            <ActionButton variant="ghost" onClick={handleCancel}>
              Cancel
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}
