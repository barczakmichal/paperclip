import { cn } from "@/lib/utils";

export type AdPlatform = "meta" | "google";

const palette: Record<AdPlatform, { bg: string; fg: string; label: string }> = {
  meta: { bg: "bg-[#1877f2]", fg: "text-white", label: "META" },
  google: { bg: "bg-[#4285f4]", fg: "text-white", label: "GOOGLE" },
};

export interface PlatformBadgeProps {
  platform: AdPlatform;
  className?: string;
}

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const p = palette[platform];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-tight",
        p.bg,
        p.fg,
        className,
      )}
    >
      {p.label}
    </span>
  );
}
