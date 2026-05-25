import { useEffect, useRef, type ReactNode } from "react";

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

function MetaLabel({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: "10px",
        fontWeight: 500,
        color: "var(--muted-foreground)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "4px",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

export interface CreativeRow {
  id: string;
  imageUrl?: string | null;
  headlines: string[];
  bodies: string[];
  cta?: string | null;
  format: string;
}

export interface ProposalMeta {
  platform: "meta" | "google";
  goal: string;
  budgetDailyPln: string;
  durationDays: number;
  audienceBrief?: string | null;
}

export interface CreativePreviewProps {
  creative: CreativeRow;
  proposal: ProposalMeta;
  open: boolean;
  onClose: () => void;
}

export function CreativePreview({ creative, proposal, open, onClose }: CreativePreviewProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          maxWidth: "720px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--foreground)",
              }}
            >
              Creative Preview
            </span>
            <PlatformBadge platform={proposal.platform} />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              fontSize: "20px",
              lineHeight: 1,
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Two-column layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {/* Image panel */}
          <div
            style={{
              borderRadius: "8px",
              overflow: "hidden",
              background: "var(--muted)",
              aspectRatio: "1/1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {creative.imageUrl ? (
              <img
                src={creative.imageUrl}
                alt="Creative"
                style={{
                  objectFit: "cover",
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : (
              <span style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>
                No image
              </span>
            )}
          </div>

          {/* Copy + meta panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Headlines */}
            {creative.headlines.length > 0 && (
              <div>
                <MetaLabel>Headlines</MetaLabel>
                <ul style={{ listStyle: "none", margin: "4px 0 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                  {creative.headlines.map((h, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--foreground)",
                      }}
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Body texts */}
            {creative.bodies.length > 0 && (
              <div>
                <MetaLabel>Body text</MetaLabel>
                <ul style={{ listStyle: "none", margin: "4px 0 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                  {creative.bodies.map((b, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: "13px",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            {creative.cta && (
              <div>
                <MetaLabel>CTA</MetaLabel>
                <span
                  style={{
                    display: "inline-block",
                    borderRadius: "6px",
                    border: "1px solid var(--primary)",
                    padding: "4px 12px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--primary)",
                    marginTop: "4px",
                  }}
                >
                  {creative.cta}
                </span>
              </div>
            )}

            {/* Campaign meta */}
            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "12px",
                fontSize: "12px",
                color: "var(--muted-foreground)",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <p style={{ margin: 0 }}>
                Goal:{" "}
                <span
                  style={{
                    color: "var(--foreground)",
                    textTransform: "capitalize",
                  }}
                >
                  {proposal.goal}
                </span>
              </p>
              <p style={{ margin: 0 }}>
                Budget:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {Number(proposal.budgetDailyPln).toFixed(0)} PLN/day
                </span>
              </p>
              <p style={{ margin: 0 }}>
                Duration:{" "}
                <span style={{ color: "var(--foreground)" }}>
                  {proposal.durationDays} days
                </span>
              </p>
              {proposal.audienceBrief && (
                <p style={{ margin: 0 }}>
                  Audience:{" "}
                  <span style={{ color: "var(--foreground)" }}>
                    {proposal.audienceBrief}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
