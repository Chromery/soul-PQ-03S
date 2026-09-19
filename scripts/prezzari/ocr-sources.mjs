import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { corruptedText } from "./lib.mjs";
const cache = process.env.PRICE_CACHE_DIR || "/cache",
  root = process.env.PRICE_SOURCE_DIR || "/sources";
const inventory = JSON.parse(
  fs.readFileSync(path.join(cache, "inventory.json")),
);
const threshold = Number(process.env.PRICE_OCR_THRESHOLD || 130);
const done = new Set();
for (const source of inventory) {
  if (source.format && source.format !== "pdf") continue;
  if (done.has(source.sha256)) continue;
  done.add(source.sha256);
  const file = path.join(cache, `${source.sha256}.json`),
    doc = JSON.parse(fs.readFileSync(file));
  for (const page of doc.pages) {
    const corrupted = corruptedText(page.text);
    if (
      page.method === "ocr" ||
      (!corrupted &&
        (page.text.replace(/\s/g, "").length > threshold ||
          doc.ocrChecks?.[page.page] >= threshold))
    )
      continue;
    const image = path.join(cache, `ocr-${source.sha256}-${page.page}`);
    const rendered = spawnSync(
      "pdftoppm",
      [
        "-f",
        String(page.page),
        "-l",
        String(page.page),
        "-scale-to",
        "2200",
        "-gray",
        "-singlefile",
        "-png",
        path.join(root, source.file),
        image,
      ],
      { timeout: 60000 },
    );
    if (rendered.status !== 0) {
      page.ocrError = "render";
      continue;
    }
    try {
      const result = spawnSync(
        "tesseract",
        [image + ".png", "stdout", "-l", "ita+eng", "--psm", "3"],
        {
          encoding: "utf8",
          timeout: 45000,
          env: { ...process.env, OMP_THREAD_LIMIT: "1" },
          maxBuffer: 5_000_000,
        },
      );
      if (result.status === 0) {
        delete page.ocrError;
        const before = page.text.replace(/\s/g, "").length,
          after = result.stdout.replace(/\s/g, "").length;
        if (
          before <= 130 ||
          after > before * 1.3 ||
          (corrupted && after > 20 && !corruptedText(result.stdout))
        ) {
          doc.nativePages ??= {};
          doc.nativePages[page.page] = page.text;
          page.text = result.stdout;
          page.method = "ocr";
        }
        doc.ocrChecks ??= {};
        doc.ocrChecks[page.page] = threshold;
      } else page.ocrError = "recognition";
    } finally {
      fs.unlinkSync(image + ".png");
    }
    fs.writeFileSync(file + ".tmp", JSON.stringify(doc));
    fs.renameSync(file + ".tmp", file);
    console.log(
      JSON.stringify({
        file: source.file,
        page: page.page,
        chars: page.text.length,
        method: page.method,
      }),
    );
  }
}
