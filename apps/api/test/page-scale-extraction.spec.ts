import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeScaleExtractionResult,
  pageOrientationsFromBboxHtml,
} from "../src/scale-extraction/scale-extraction.service.js";

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

test("mantiene la pagina quando le righe principali sono già orizzontali", () => {
  const orientations = pageOrientationsFromBboxHtml(`
    <page width="600" height="800">
      <line xMin="20" yMin="20" xMax="420" yMax="35">
        <word xMin="20" yMin="20" xMax="100" yMax="35">Elaborato</word>
        <word xMin="110" yMin="20" xMax="220" yMax="35">planimetrico</word>
      </line>
      <line xMin="50" yMin="100" xMax="350" yMax="115">
        <word xMin="50" yMin="100" xMax="100" yMax="115">Piano</word>
        <word xMin="110" yMin="100" xMax="180" yMax="115">terra</word>
      </line>
      <line xMin="570" yMin="200" xMax="580" yMax="300">
        <word xMin="570" yMin="280" xMax="580" yMax="300">Foglio</word>
        <word xMin="570" yMin="200" xMax="580" yMax="220">10</word>
      </line>
    </page>
  `);

  assert.equal(orientations.get(1)?.rotation, 0);
  assert.ok((orientations.get(1)?.confidence ?? 0) > 0.8);
});

test("ruota a destra il testo principale disposto dal basso verso l'alto", () => {
  const orientations = pageOrientationsFromBboxHtml(`
    <page width="600" height="800">
      <line xMin="500" yMin="100" xMax="515" yMax="600">
        <word xMin="500" yMin="520" xMax="515" yMax="600">Elaborato</word>
        <word xMin="500" yMin="350" xMax="515" yMax="500">planimetrico</word>
        <word xMin="500" yMin="100" xMax="515" yMax="330">catastale</word>
      </line>
      <line xMin="450" yMin="150" xMax="465" yMax="500">
        <word xMin="450" yMin="450" xMax="465" yMax="500">Piano</word>
        <word xMin="450" yMin="150" xMax="465" yMax="430">terra</word>
      </line>
      <line xMin="20" yMin="20" xMax="120" yMax="35">
        <word xMin="20" yMin="20" xMax="50" yMax="35">Data</word>
        <word xMin="60" yMin="20" xMax="120" yMax="35">odierna</word>
      </line>
    </page>
  `);

  assert.equal(orientations.get(1)?.rotation, 90);
  assert.ok((orientations.get(1)?.confidence ?? 0) > 0.8);
});
