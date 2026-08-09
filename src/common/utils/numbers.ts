const DECIMAL_BASE = 10;

/**
 * Rounds a value for presentation. Non finite values collapse to `0` so the API
 * never returns `NaN` or `Infinity`.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = DECIMAL_BASE ** decimals;

  return Math.round(value * factor) / factor;
}

/** Division that yields `0` instead of `NaN`/`Infinity` when the denominator is zero. */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  const result = numerator / denominator;

  return Number.isFinite(result) ? result : 0;
}
