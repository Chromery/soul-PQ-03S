import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
const run = promisify(execFile);
type Rotation = 0 | 90 | 180 | 270;

export function scoreOrientationTsv(tsv: string) {
  const words = tsv.split(/\r?\n/).map(line => line.split("\t")).filter(row =>
    row[0] === "5" && /^[\p{L}]{3,}$/u.test(row[11] ?? "") && Number(row[10]) >= 0);
  const weight = words.reduce((sum, row) => sum + Math.min(row[11].length, 20), 0);
  const score = weight ? words.reduce((sum, row) => sum + Number(row[10]) * Math.min(row[11].length, 20), 0) / weight : 0;
  return { score, words: words.length };
}

export function chooseOcrOrientation(candidates: Array<{ rotation: Rotation; score: number; words: number }>) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const [best, runnerUp] = sorted;
  if (sorted.length !== 4 || !best || best.words < 4 || best.score < 85 || best.score - runnerUp.score < 15) return null;
  return { rotation: best.rotation, confidence: best.score / 100,
    evidence: `OCR: ${best.words} parole, qualità ${best.score.toFixed(1)}/100; distacco ${(best.score - runnerUp.score).toFixed(1)} punti` };
}

export async function detectOcrOrientation(imagePath: string, directory: string, pageNumber: number) {
  const candidates = [];
  try {
    for (const rotation of [0, 90, 180, 270] as const) {
      const candidate = rotation === 0 ? imagePath : path.join(directory, `orientation-${pageNumber}-${rotation}.jpg`);
      if (rotation !== 0) await run("jpegtran", ["-copy", "none", "-rotate", String(rotation), "-outfile", candidate, imagePath], { timeout: 10_000 });
      const output = await run("tesseract", [candidate, "stdout", "-l", "ita", "--psm", "11", "tsv"], {
        timeout: 15_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: "1" },
      });
      candidates.push({ rotation, ...scoreOrientationTsv(String(output.stdout)) });
    }
    return chooseOcrOrientation(candidates);
  } catch {
    // Timeout, sparse text or missing OCR must never rotate an ambiguous page.
    return null;
  }
}
