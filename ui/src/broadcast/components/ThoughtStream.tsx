import { cn } from "@/lib/utils";

export type ThoughtKind = "thought" | "tool" | "result";

export interface ThoughtLine {
  kind: ThoughtKind;
  text: string;
  ts?: string;
}

export interface ThoughtStreamProps {
  lines: ThoughtLine[];
  active?: boolean;
  maxLines?: number;
  className?: string;
}

const kindColor: Record<ThoughtKind, string> = {
  thought: "text-foreground",
  tool: "text-muted-foreground",
  result: "text-green-400",
};

const kindPrefix: Record<ThoughtKind, string> = {
  thought: "",
  tool: "▸ ",
  result: "✓ ",
};

export function ThoughtStream({ lines, active, maxLines = 6, className }: ThoughtStreamProps) {
  const visible = lines.slice(-maxLines);
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed",
        className,
      )}
    >
      <style>{`
        @keyframes broadcast-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          [data-thought-cursor] { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
      {visible.map((l, i) => (
        <div key={i} data-thought-line className={cn("truncate", kindColor[l.kind])}>
          {l.ts && <span className="text-muted-foreground/60">[{l.ts}] </span>}
          {kindPrefix[l.kind]}
          {l.text}
        </div>
      ))}
      {active && (
        <span
          data-thought-cursor
          className="inline-block h-3 w-1.5 bg-cyan-400 align-middle"
          style={{ animation: "broadcast-blink 1s steps(2) infinite" }}
        />
      )}
    </div>
  );
}
