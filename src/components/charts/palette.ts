// Validated categorical palette (fixed order — never cycled/reassigned; see dataviz skill,
// references/palette.md). This app is light-only (no dark mode / no data-theme toggle in
// globals.css), so only the light-mode steps are needed. Chrome (surface, text, gridlines)
// comes from the app's own design tokens in globals.css instead of the skill's default chrome,
// so charts sit naturally inside the existing paper/ink aesthetic.
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
