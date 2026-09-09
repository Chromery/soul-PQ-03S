export type QuarterTurn = 0 | 90 | 180 | 270;

// PDF /Rotate is already included in the viewport: do not apply it twice.
export function textOrientation(items: readonly unknown[], viewportTransform: readonly number[]) {
  const weights = [0, 0, 0, 0];
  let runs = 0;
  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[]; dir?: string };
    const text = item.str?.replace(/\s/g, "") ?? "";
    if (text.length < 3 || item.dir === "ttb" || !item.transform || item.transform.length < 4) continue;
    const [a, b] = item.transform;
    const [va, vb, vc, vd] = viewportTransform;
    const angle = Math.atan2(vb * a + vd * b, va * a + vc * b) * 180 / Math.PI;
    if (!Number.isFinite(angle)) continue;
    const turn = Math.round(-angle / 90);
    if (Math.abs(-angle - turn * 90) > 10) continue;
    weights[((turn % 4) + 4) % 4] += Math.min(text.length, 120);
    runs++;
  }
  const total = weights.reduce((a, b) => a + b, 0), best = Math.max(...weights);
  if (runs < 2 || total < 24 || best / total < .85) return null;
  return { rotation: (weights.indexOf(best) * 90) as QuarterTurn, confidence: best / total };
}
