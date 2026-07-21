// Validated categorical palette (fixed order — never cycled/reassigned; see dataviz skill,
// references/palette.md). These are fixed data-series hues, not semantic/theme colors, so they
// stay constant across light/dark rather than routing through globals.css tokens -- chosen at a
// mid-tone saturation that holds contrast on both --paper-raised (light) and its dark
// equivalent. Chrome (surface, text, gridlines) still comes from the app's own design tokens.
export const CATEGORICAL = [
  '#2a78d6', // 1 blue
  '#008300', // 2 green
  '#e87ba4', // 3 magenta
  '#eda100', // 4 yellow
  '#1baf7a', // 5 aqua
  '#eb6834', // 6 orange
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

export function seriesColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

// Sequential (single-hue) ramp, light -> dark, for magnitude-only single-series charts.
export const SEQUENTIAL_BLUE = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab'] as const;
