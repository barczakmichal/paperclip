import { cn } from "@/lib/utils";

export interface EqualizerIndicatorProps {
  active: boolean;
  intensity?: "low" | "med" | "high";
  className?: string;
}

const bars = [
  { height: 6, delay: 0 },
  { height: 12, delay: 0.2 },
  { height: 8, delay: 0.4 },
  { height: 10, delay: 0.6 },
];

const intensityDuration: Record<NonNullable<EqualizerIndicatorProps["intensity"]>, number> = {
  low: 1.4,
  med: 1.0,
  high: 0.7,
};

export function EqualizerIndicator({ active, intensity = "med", className }: EqualizerIndicatorProps) {
  const dur = intensityDuration[intensity];
  return (
    <div data-eq-active={active ? "true" : "false"} className={cn("inline-flex items-end gap-0.5", className)} aria-hidden="true">
      <style>{`
        @keyframes broadcast-eq-wave { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); } }
        @media (prefers-reduced-motion: reduce) {
          [data-eq-bar] { animation: none !important; transform: none !important; }
        }
      `}</style>
      {bars.map((b, i) => (
        <span
          key={i}
          data-eq-bar
          className="w-[3px] rounded-sm bg-cyan-400"
          style={{
            height: `${b.height}px`,
            animation: active
              ? `broadcast-eq-wave ${dur}s ease-in-out infinite ${b.delay}s`
              : undefined,
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}
