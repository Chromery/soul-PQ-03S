export const ROMA_2025_SHA256 = "bbcbedb7de8fc3a0cfb623f5c456d11069e6e8cac44bde28967bc3ff4187f81d";

// Re-anchor an extractor's reordered quote in the original layout, without
// changing any number. A unique matching price line is necessary, not sufficient:
// the separate semantic audit still has to verify the row, unit and conditions.
export function romaPriceContext(text, min, max) {
  const lines = text.split("\n");
  const values = line => [...line.matchAll(/\d[\d.]*,\d{2}\b/g)]
    .map(m => Number(m[0].replaceAll(".", "").replace(",", ".")));
  const indexes = lines.flatMap((line, i) => {
    const nums = values(line);
    return nums.includes(min) && (max === null || nums.includes(max)) ? [i] : [];
  });
  if (indexes.length !== 1) return null;
  return lines.slice(Math.max(0, indexes[0] - 6), indexes[0] + 7).join("\n").trim();
}
