'use client';

import { useState } from 'react';
import { seriesColor } from './palette';

export interface BarChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface BarChartRow {
  category: string;
  values: Record<string, number>;
}

interface BarChartProps {
  rows: BarChartRow[];
  series: BarChartSeries[];
  formatValue?: (v: number) => string;
  emptyMessage?: string;
}

// Horizontal bar chart — one row per category, one bar per series (grouped when series.length > 1).
// Built as plain HTML/CSS (no charting library): a background track is the hit target for hover
// (so near-zero bars are still easy to hover/focus), the filled portion carries the series color,
// and the value rides as a direct label at the tip (a fixed-width column to the right, so labels
// never collide with the bar and never need to be measured/clipped).
export function BarChart({ rows, series, formatValue = (v) => String(v), emptyMessage = 'No data available.' }: BarChartProps) {
  const [hovered, setHovered] = useState<{ row: number; series: number } | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--ink-muted)] italic">{emptyMessage}</p>;
  }

  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r.values[s.key] ?? 0)));
  const colors = series.map((s, i) => s.color ?? seriesColor(i));

  return (
    <div>
      {series.length > 1 && (
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {series.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
              <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: colors[i] }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3.5">
        {rows.map((row, ri) => (
          <div key={row.category}>
            <div className="text-xs text-[var(--ink)] font-medium mb-1 truncate" title={row.category}>
              {row.category}
            </div>
            <div className="space-y-0.5">
              {series.map((s, si) => {
                const value = row.values[s.key] ?? 0;
                const pct = Math.max(0, Math.min(100, (value / max) * 100));
                const isHovered = hovered?.row === ri && hovered?.series === si;
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <div
                      className="relative flex-1 h-[18px] bg-[var(--paper-dark)] rounded-[2px] cursor-default"
                      tabIndex={0}
                      role="img"
                      aria-label={`${row.category}${series.length > 1 ? ` — ${s.label}` : ''}: ${formatValue(value)}`}
                      onMouseEnter={() => setHovered({ row: ri, series: si })}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered({ row: ri, series: si })}
                      onBlur={() => setHovered(null)}
                    >
                      <div
                        className="h-full rounded-r-[4px] transition-[width,opacity] duration-150"
                        style={{
                          width: value > 0 ? `${Math.max(pct, 1.5)}%` : 0,
                          backgroundColor: colors[si],
                          opacity: isHovered ? 0.8 : 1,
                        }}
                      />
                      {isHovered && (
                        <div className="absolute -top-7 left-0 z-10 bg-[var(--ink)] text-[var(--paper)] text-[11px] px-2 py-1 rounded whitespace-nowrap pointer-events-none shadow-[0_2px_6px_var(--shadow)]">
                          <span className="font-semibold">{formatValue(value)}</span>
                          {series.length > 1 && <span className="opacity-70 ml-1">{s.label}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-mono text-[var(--ink-muted)] w-20 text-right shrink-0">
                      {formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
