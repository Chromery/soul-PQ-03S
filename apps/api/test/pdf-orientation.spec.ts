import assert from "node:assert/strict";
import test from "node:test";
import { textOrientation } from "../../web/src/pdf-orientation.js";
import { parseNeuralwattPageExtraction, ScaleExtractionService } from "../src/scale-extraction/scale-extraction.service.js";
import { chooseOcrOrientation, detectOcrOrientation } from "../src/scale-extraction/pdf-ocr-orientation.js";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { execFileSync, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("PDF.js text baselines identify quarter turns without double-applying PDF metadata", () => {
  const items = (degrees: number) => ["PIANTA PIANO TERRA", "STUDIO TECNICO CATASTALE"].map(str => ({ str,
    transform: [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180), 0, 1, 0, 0] }));
  for (const rotation of [0, 90, 180, 270]) {
    assert.equal(textOrientation(items(rotation), [1, 0, 0, -1, 0, 0])?.rotation, rotation);
  }
  assert.equal(textOrientation(items(90), [0, 1, 1, 0, 0, 0])?.rotation, 0);
  assert.equal(textOrientation([], [1, 0, 0, -1, 0, 0]), null);
  assert.equal(textOrientation([...items(0), ...items(90)], [1, 0, 0, -1, 0, 0]), null);
});

test("unverified vision orientation never overrides measured page orientation", () => {
  const page = { pageNumber: 1, imageDataUrl: "", detailImages: [], sheetSize: null, orientation: null };
  const result = (confidence: number, evidence: string | null) => parseNeuralwattPageExtraction(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ found: false, orientation_rotation: 180, orientation_confidence: confidence, orientation_evidence: evidence }),
  } }] }), page);
  assert.equal(result(.95, "PIANTA PIANO TERRA capovolto").orientation_rotation, null);
  assert.equal(result(.95, "PIANTA PIANO TERRA capovolto").found, false);
  assert.equal(result(.6, "Testo incerto").orientation_rotation, null);
  assert.equal(result(.99, null).orientation_rotation, null);
});

test("OCR only accepts a clear winner with enough reliably read words", () => {
  const candidates = [0, 90, 180, 270].map(rotation => ({ rotation, score: rotation === 270 ? 96 : 40, words: 8 })) as Parameters<typeof chooseOcrOrientation>[0];
  assert.equal(chooseOcrOrientation(candidates)?.rotation, 270);
  assert.equal(chooseOcrOrientation(candidates.map(item => ({ ...item, score: 90 }))), null);
  assert.equal(chooseOcrOrientation(candidates.map(item => ({ ...item, words: 2 }))), null);
});

test("real OCR recognizes rasterized pages in all four orientations", { skip: spawnSync("tesseract", ["--version"]).status !== 0 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pq-ocr-test-"));
  try {
    for (const rotation of [0, 90, 180, 270]) {
      const pdf = await PDFDocument.create(), sheet = pdf.addPage([420, 595]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const [index, text] of ["PIANTA PIANO TERRA", "STUDIO TECNICO CAMPIONE", "UFFICI E MAGAZZINO", "SCALA 1:200", "ELABORATO PLANIMETRICO"].entries())
        sheet.drawText(text, { x: 60, y: 420 - index * 65, font, size: 16 });
      sheet.setRotation(degrees(rotation));
      const prefix = path.join(directory, `page-${rotation}`);
      await fs.writeFile(prefix + ".pdf", await pdf.save());
      execFileSync("pdftoppm", ["-singlefile", "-r", "150", "-jpeg", prefix + ".pdf", prefix]);
      const result = await detectOcrOrientation(prefix + ".jpg", directory, rotation + 1);
      assert.equal(result?.rotation, (360 - rotation) % 360, JSON.stringify({ rotation, result }));
      if (rotation === 90) {
        const service = new ScaleExtractionService({} as never, { get: () => undefined } as never);
        (service as any).callNeuralwattScaleExtraction = () => { throw new Error("OCR must not call NeuralWatt"); };
        const buffer = await fs.readFile(prefix + ".pdf");
        const extracted = await (service as any).extractScale({ fileName: "test.pdf", fileBuffer: buffer, sizeBytes: buffer.length }, true);
        assert.equal(extracted.pages[0].orientation_rotation, 270);
        assert.equal(extracted.found, false);
        assert.equal(extracted.scale_denominator, null);
      }
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("background orientation preserves annotated/calibrated/manual-zero pages and uses optimistic locking", async () => {
  const updatedAt = new Date();
  let patch: any;
  const service = new ScaleExtractionService({ planAnalysisDraft: {
    findUnique: async () => ({ updatedAt, payload: { selections: [{ page: 1 }], lotBoundaries: [{ page: 2 }],
      pageScales: { "3": { calibration: { page: 3 } } }, pageRotations: { "4": 0 } } }),
    updateMany: async (value: unknown) => { patch = value; return { count: 1 }; },
  } } as never, { get: () => undefined } as never);
  await (service as any).persistDetectedOrientations("TEST", { pages: [1, 2, 3, 4, 5].map(page_number =>
    ({ page_number, orientation_rotation: 90, orientation_confidence: .99 })) });
  assert.deepEqual(patch.where, { propertyId: "TEST", updatedAt });
  assert.deepEqual(patch.data.payload.pageRotations, { "4": 0, "5": 90 });
});
