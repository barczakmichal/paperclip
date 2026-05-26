export interface DataPoint {
  date: string;
  roas: number;
}

export interface ROASChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ROASChart({ data, width = 800, height = 220, className, style }: ROASChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: `${height}px`,
          fontSize: "12px",
          color: "var(--muted-foreground)",
          ...style,
        }}
      >
        No ROAS data yet
      </div>
    );
  }

  const pad = { top: 24, right: 16, bottom: 24, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxRoas = Math.max(...data.map((d) => d.roas), 1);
  const minRoas = Math.min(...data.map((d) => d.roas), 0);
  const range = maxRoas - minRoas || 1;

  const toX = (i: number): number =>
    pad.left + (i / Math.max(data.length - 1, 1)) * innerW;

  const toY = (v: number): number =>
    pad.top + innerH - ((v - minRoas) / range) * innerH;

  const polylinePoints = data.map((d, i) => `${toX(i)},${toY(d.roas)}`).join(" ");

  // Three Y-axis ticks
  const yTicks: Array<{ y: number; label: string }> = [
    { y: toY(minRoas), label: minRoas.toFixed(1) },
    { y: toY(minRoas + range / 2), label: (minRoas + range / 2).toFixed(1) },
    { y: toY(maxRoas), label: maxRoas.toFixed(1) },
  ];

  // Marketing AI brand colour (fallback: amber-ish oklch)
  const lineColor = "var(--grad-marketing, oklch(0.70 0.20 60))";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", ...style }}
      aria-label="ROAS over time"
      role="img"
    >
      {/* Grid lines + Y-axis labels */}
      {yTicks.map((tick) => (
        <g key={tick.label}>
          <line
            x1={pad.left}
            y1={tick.y}
            x2={pad.left + innerW}
            y2={tick.y}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
          />
          <text
            x={pad.left - 4}
            y={tick.y + 4}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
            opacity={0.5}
          >
            {tick.label}
          </text>
        </g>
      ))}

      {/* ROAS line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data dots + value labels */}
      {data.map((d, i) => {
        const cx = toX(i);
        const cy = toY(d.roas);
        const isLast = i === data.length - 1;
        const isFirst = i === 0;
        const labelAbove = cy > pad.top + 14;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={3.5} fill={lineColor}>
              <title>{`${d.date}: ROAS ${d.roas.toFixed(2)}`}</title>
            </circle>
            <text
              x={cx}
              y={labelAbove ? cy - 8 : cy + 16}
              textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
              fontSize={10}
              fontWeight={600}
              fill="currentColor"
              opacity={0.85}
            >
              {d.roas.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* X-axis labels: first and last date */}
      {data.length > 0 && (
        <>
          <text
            x={toX(0)}
            y={height - 4}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            opacity={0.5}
          >
            {data[0]!.date.slice(5)}
          </text>
          {data.length > 1 && (
            <text
              x={toX(data.length - 1)}
              y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              opacity={0.5}
            >
              {data[data.length - 1]!.date.slice(5)}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
