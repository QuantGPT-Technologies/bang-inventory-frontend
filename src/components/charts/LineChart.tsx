'use client';

import { useRef, useState } from 'react';
import { seriesColor } from './palette';

export interface LineChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface LineChartPoint {
  x: string;
  values: Record<string, number>;
}

interface LineChartProps {
  points: LineChartPoint[];
  series: LineChartSeries[];
  formatValue?: (v: number) => string;
  height?: number;
  emptyMessage?: string;
}

const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

// Nice round upper bound for the y-axis (0 stays the floor — these are all non-negative counts/kg).
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// Multi-series line chart (trend over time) — plain inline SVG, no charting library. A vertical
// crosshair tracks the pointer and snaps to the nearest x position (interaction.md: "the
// crosshair finds the X"); the tooltip lists every series at that x rather than requiring the
// pointer to land on a line.
export function LineChart({
  points,
  series,
  formatValue = (v) => String(v),
  height = 220,
  emptyMessage = 'No data available.',
}: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-[var(--ink-muted)] italic">{emptyMessage}</p>;
  }

  const width = 720;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const rawMax = Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)));
  const maxY = niceMax(rawMax);
  const colors = series.map((s, i) => s.color ?? seriesColor(i));

  const xAt = (i: number) => (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => innerH - (v / maxY) * innerH;

  const pathFor = (key: string) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(p.values[key] ?? 0).toFixed(2)}`).join(' ');

  // Show at most ~7 x-axis tick labels regardless of point count, so dense daily trends don't collide.
  const tickEvery = Math.max(1, Math.ceil(points.length / 7));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width - PADDING.left;
    const idx = Math.round((relX / innerW) * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : 0;
  // Flip the tooltip to the left half when it would overflow the chart's right edge.
  const tooltipOnLeft = hoverIndex !== null && hoverIndex > points.length * 0.65;

  return (
    <div>
      {series.length > 1 && (
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {series.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
              <span className="inline-block w-3 h-[2px] rounded-full" style={{ backgroundColor: colors[i] }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full touch-none"
          style={{ height }}
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <g transform={`translate(${PADDING.left},${PADDING.top})`}>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={0} x2={innerW} y1={yAt(t)} y2={yAt(t)} stroke="var(--border-light)" strokeWidth={1} />
                <text x={-8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--ink-muted)]" fontSize={10}>
                  {formatValue(t)}
                </text>
              </g>
            ))}

            {points.map((p, i) =>
              i % tickEvery === 0 || i === points.length - 1 ? (
                <text key={p.x} x={xAt(i)} y={innerH + 18} textAnchor="middle" className="fill-[var(--ink-muted)]" fontSize={10}>
                  {p.x.slice(5)}
                </text>
              ) : null
            )}

            {series.map((s, si) => (
              <path key={s.key} d={pathFor(s.key)} fill="none" stroke={colors[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {series.map((s, si) => {
              const last = points[points.length - 1];
              return (
                <circle
                  key={s.key}
                  cx={xAt(points.length - 1)}
                  cy={yAt(last.values[s.key] ?? 0)}
                  r={4}
                  fill={colors[si]}
                  stroke="var(--paper)"
                  strokeWidth={2}
                />
              );
            })}

            {hoverIndex !== null && (
              <>
                <line x1={hoverX} x2={hoverX} y1={0} y2={innerH} stroke="var(--ink-muted)" strokeWidth={1} strokeDasharray="2,2" />
                {series.map((s, si) => (
                  <circle
                    key={s.key}
                    cx={hoverX}
                    cy={yAt(hover?.values[s.key] ?? 0)}
                    r={5}
                    fill={colors[si]}
                    stroke="var(--paper)"
                    strokeWidth={2}
                  />
                ))}
              </>
            )}
          </g>
        </svg>

        {hover && (
          <div
            className="absolute top-2 z-10 bg-[var(--ink)] text-[var(--paper)] text-[11px] px-2.5 py-1.5 rounded pointer-events-none shadow-[0_2px_6px_var(--shadow)] min-w-[120px]"
            style={{
              left: tooltipOnLeft ? undefined : `${((PADDING.left + hoverX) / width) * 100}%`,
              right: tooltipOnLeft ? `${100 - ((PADDING.left + hoverX) / width) * 100}%` : undefined,
              transform: tooltipOnLeft ? 'translateX(8px)' : 'translateX(8px)',
            }}
          >
            <div className="font-semibold mb-0.5">{hover.x}</div>
            {series.map((s, si) => (
              <div key={s.key} className="flex items-center gap-1.5 opacity-90">
                <span className="inline-block w-2.5 h-[2px]" style={{ backgroundColor: colors[si] }} />
                <span>{s.label}:</span>
                <span className="font-semibold ml-auto">{formatValue(hover.values[s.key] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
