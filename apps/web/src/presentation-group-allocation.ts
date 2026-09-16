/** Allocate a presentation total in exact cents, with deterministic remainders. */
export function allocatePresentationTotal(total: number, values: Array<number | null>, fallback: number[]): number[] {
  const cents = Math.round(total * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || !values.length) throw new Error("Importo non valido");
  let weights = values.map(value => value != null && Number.isFinite(value) && value > 0 ? value : 0);
  if (!weights.some(Boolean)) weights = fallback.map(value => Number.isFinite(value) && value > 0 ? value : 0);
  if (!weights.some(Boolean)) weights = values.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map(weight => cents * (weight / sum));
  const result = shares.map(Math.floor);
  const order = shares.map((value, index) => ({ index, remainder: value - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const missing = cents - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < missing; i++) result[order[i % order.length].index]++;
  return result.map(value => value / 100);
}
