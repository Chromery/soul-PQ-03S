import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScaleExtractionResult } from "../src/scale-extraction/scale-extraction.service.js";

test("mantiene una scala distinta per ogni pagina estratta", () => {
  const result = normalizeScaleExtractionResult({
    pages: [
      {
        page_number: 1,
        found: true,
        scale_denominator: 200,
        scale_label: "Scala 1:200",
        sheet_size: "A4",
        confidence: 0.96,
        evidence: "Scala 1:200",
        warnings: [],
      },
      {
        page_number: 2,
        found: true,
        scale_denominator: 500,
        scale_label: "Scala 1:500",
        sheet_size: "A3",
        confidence: 0.93,
        evidence: "Scala 1:500",
        warnings: [],
      },
      {
        page_number: 3,
        found: false,
        scale_denominator: null,
        scale_label: null,
        sheet_size: null,
        confidence: 0,
        evidence: null,
        warnings: ["Scala non presente"],
      },
    ],
  });

  assert.equal(result.pages.length, 3);
  assert.equal(result.pages[0].scale_denominator, 200);
  assert.equal(result.pages[1].scale_denominator, 500);
  assert.equal(result.pages[2].found, false);
  assert.equal(result.scale_denominator, 200);
});

test("normalizza ancora la vecchia risposta a scala singola come pagina 1", () => {
  const result = normalizeScaleExtractionResult({
    found: true,
    scale_denominator: 100,
    scale_label: "1:100",
    sheet_size: "A4",
    confidence: 0.8,
    evidence: "scala 1:100",
    warnings: [],
  });

  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].page_number, 1);
  assert.equal(result.pages[0].scale_denominator, 100);
});
