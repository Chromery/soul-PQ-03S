import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright-core";
import { personalizeV3Cover, V3_COVER_LAYOUT } from "../src/presentations/v3-cover.js";

test("v3 cover replaces the sample name with vector single-line text and preserves background", {
  skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
}, async () => {
  const output = process.env.PQ_COVER_REVIEW_DIR || await mkdtemp(path.join(tmpdir(), "pq-cover-test-"));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  try {
    const source = await readFile(new URL("../../../visual reference/soul_realestate_rendita_catastale_new_template.pdf", import.meta.url));
    const original = await PDFDocument.load(source);
    const sourcePath = path.join(output, "original.pdf");
    await writeFile(sourcePath, source);
    const names = [
      "Riviera Retail Park Srl", // Visual control: original typography and position.
      "JRS SILVATEAM INGREDIENTS S.R.L.",
      "ABC Srl",
      "SOCIETÀ ITALIANA PER LA GESTIONE E VALORIZZAZIONE DEL PATRIMONIO IMMOBILIARE INDUSTRIALE E COMMERCIALE S.P.A.",
      "Gruppo Società Riunite – Ricerca & Sviluppo <Immobili>\nItalia S.r.l.",
      "W".repeat(240), // Worst-case unbroken name at the API character limit.
    ];
    const layouts = [];
    for (const [index, name] of names.entries()) {
      const pdf = await PDFDocument.load(source);
      const layout = await personalizeV3Cover(pdf, browser, name);
      layouts.push(layout);
      assert.ok(layout.fontSize <= 19 && layout.fontSize > 0);
      assert.ok(layout.width <= layout.maxWidth + 0.1);
      assert.equal(pdf.getPageCount(), original.getPageCount());
      const target = path.join(output, `cover-${index}.pdf`);
      await writeFile(target, await pdf.save());
      const text = execFileSync("pdftotext", ["-f", "1", "-l", "1", target, "-"], { encoding: "utf8" });
      assert.ok(text.replace(/\s+/gu, " ").includes(name.replace(/\s+/gu, " ")));
      if (index !== 0) assert.ok(!text.includes("Riviera Retail Park"));
      const bbox = execFileSync("pdftotext", ["-f", "1", "-l", "1", "-bbox", target, "-"], { encoding: "utf8" });
      const words = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g)]
        .map(match => ({ x: +match[1], y: +match[2], right: +match[3], bottom: +match[4] })).filter(word => word.y > 204);
      assert.ok(words.length > 0);
      assert.ok(Math.max(...words.map(w => w.y)) - Math.min(...words.map(w => w.y)) < 0.2, "Company must stay on one line");
      assert.ok(Math.min(...words.map(w => w.x)) >= V3_COVER_LAYOUT.left - 0.5);
      assert.ok(Math.max(...words.map(w => w.right)) < 794.5, "Company must remain inside the right margin");
      assert.ok(Math.max(...words.map(w => w.bottom)) < 238);
      // Other pages must be visually/textually unchanged by cover personalisation.
      const remaining = ["-f", "2", "-layout"];
      assert.equal(execFileSync("pdftotext", [...remaining, target, "-"], { encoding: "utf8" }),
        execFileSync("pdftotext", [...remaining, sourcePath, "-"], { encoding: "utf8" }));
      execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-scale-to", "1100", "-png", target, path.join(output, `cover-${index}`)]);
    }
    // Background is not masked or raster-replaced: compare pixels outside the name strip.
    for (const [name, pdf] of [["before", sourcePath], ["after", path.join(output, "cover-1.pdf")]]) {
      execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-r", "72", pdf, path.join(output, name)]);
    }
    const before = await readFile(path.join(output, "before.ppm"));
    const after = await readFile(path.join(output, "after.ppm"));
    const header = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(before.toString("latin1", 0, 64))!;
    const start = header[0].length, width = +header[1], height = +header[2];
    assert.equal(before.length, after.length);
    for (let y = 0; y < height; y++) {
      if (y >= 207 && y <= 234) continue;
      assert.ok(before.subarray(start + y * width * 3, start + (y + 1) * width * 3)
        .equals(after.subarray(start + y * width * 3, start + (y + 1) * width * 3)), `Background changed on row ${y}`);
    }
    const empty = await PDFDocument.load(source);
    await assert.rejects(personalizeV3Cover(empty, browser, "  "), /Nome cliente mancante/);
    const changedTemplate = await PDFDocument.create();
    changedTemplate.addPage();
    await assert.rejects(personalizeV3Cover(changedTemplate, browser, "Test"), /copertina|template/);
    console.log("Cover test layouts:", layouts.map(({ fontSize, width }) => ({ fontSize, width })));
  } finally {
    await browser.close();
    if (!process.env.PQ_COVER_REVIEW_DIR) await rm(output, { recursive: true, force: true });
  }
});
