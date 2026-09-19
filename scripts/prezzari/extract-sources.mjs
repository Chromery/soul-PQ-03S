// Offline, resumable extraction. Run inside the existing API image (Poppler/Tesseract).
// Source PDFs are read-only; cache contains derived text, never original customer data.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = process.env.PRICE_SOURCE_DIR || "/sources";
const cache = process.env.PRICE_CACHE_DIR || "/cache";
fs.mkdirSync(cache, { recursive: true });
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const documents = [];
for (const file of walk(root)
  .filter((f) => /\.pdf$/i.test(f))
  .sort()) {
  const relative = path.relative(root, file),
    sha256 = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const output = path.join(cache, `${sha256}.json`);
  let doc;
  if (fs.existsSync(output)) doc = JSON.parse(fs.readFileSync(output, "utf8"));
  else {
    const info = spawnSync("pdfinfo", [file], {
      encoding: "utf8",
      timeout: 30000,
    });
    const text = spawnSync("pdftotext", ["-layout", file, "-"], {
      encoding: "utf8",
      maxBuffer: 20_000_000,
      timeout: 60000,
    });
    const pageCount = Number(info.stdout?.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    const chunks = (text.stdout || "").split("\f");
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      page: i + 1,
      text: chunks[i] || "",
      method: "text",
    }));
    doc = {
      sha256,
      pageCount,
      pages,
      error: text.status ? text.stderr?.slice(0, 1000) : undefined,
    };
    fs.writeFileSync(output, JSON.stringify(doc));
  }
  documents.push({
    file: relative,
    sha256,
    pageCount: doc.pageCount,
    textPages: doc.pages.filter((p) => p.text.replace(/\s/g, "").length > 100)
      .length,
    chars: doc.pages.reduce((s, p) => s + p.text.length, 0),
  });
}
fs.writeFileSync(
  path.join(cache, "inventory.json"),
  JSON.stringify(documents, null, 2),
);
console.log(
  JSON.stringify(
    {
      files: documents.length,
      unique: new Set(documents.map((d) => d.sha256)).size,
      pages: documents.reduce((s, d) => s + d.pageCount, 0),
      needsOcr: documents.filter((d) => d.textPages < d.pageCount),
      documents,
    },
    null,
    2,
  ),
);
