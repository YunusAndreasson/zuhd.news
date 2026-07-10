import type { ColorPalette } from '../constants/theme';

export interface SeverityInput {
  /** GDACS alert level — only `'Red'` earns the urgent tint. */
  alertLevel?: string;
  /** Conflict fatality count — any positive value earns the urgent tint. */
  fatalities?: number;
}

/** Whether an event sits at the single most-urgent tier the app tints in the
 *  foreground rose hue: a Red GDACS alert or a fatal conflict. Lower tiers stay
 *  monochrome — DESIGN.md §Sentiment makes severity single-tier so the warm hue
 *  carries one critical signal rather than a competing 3-step ladder. */
export function isUrgentSeverity({ alertLevel, fatalities }: SeverityInput): boolean {
  return alertLevel === 'Red' || (fatalities !== undefined && fatalities > 0);
}

/** Focal text color for a severity-bearing event: `toneUnfavorableText` when
 *  urgent (see `isUrgentSeverity`), otherwise the caller's monochrome
 *  `fallback`. Centralizes the "only Red / fatal earns the hue" editorial rule
 *  that had been re-implemented inline in ConflictSheet, DisasterSheet,
 *  CountrySheet and DisambiguationSheet, so it can never drift between them.
 *  The `fallback` is a type parameter so callers passing `undefined` (keep the
 *  variant's own color) stay well-typed. */
export function severityTint<T extends string | undefined>(
  colors: ColorPalette,
  input: SeverityInput,
  fallback: T,
): string | T {
  return isUrgentSeverity(input) ? colors.toneUnfavorableText : fallback;
}
