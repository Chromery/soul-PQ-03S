import test from "node:test";
import assert from "node:assert/strict";
import {
  candidatePage,
  completeBatch,
  auditContext,
  hash,
  corruptedText,
  heightScenario,
  includesLandInConditions,
} from "./lib.mjs";

test("land inclusion recognizes positive cost conditions, not locations or exclusions", () => {
  for (const text of [
    "Valore comprensivo dell'area di sedime.",
    "Costo comprensivo del valore del terreno",
    "Suolo incluso",
    "Include oneri. Terreno compreso.",
  ])
    assert.equal(includesLandInConditions(text), true, text);
  for (const text of [
    "Non comprensivo del valore del terreno",
    "Albergo comprensivo di hall, situato in area turistica",
    "Oneri inclusi. Terreno escluso.",
    "Costo non comprensivo di oneri indiretti. Macro area 1.",
  ])
    assert.equal(includesLandInConditions(text), false, text);
});

test("height scenarios use only explicit bounded ranges, never limits or area dimensions", () => {
  assert.equal(
    heightScenario("superficie 500-2000 mq, altezza media 5-8 m.")?.height,
    6.5,
  );
  assert.equal(
    heightScenario("altezza compresa tra 4,0 e 6,5 metri")?.height,
    5.25,
  );
  assert.equal(heightScenario("altezza fino a 5 m"), null);
  assert.equal(heightScenario("luce 5-20 m; superficie 200-400 mq"), null);
});

test("encoded glyph soup is not mistaken for readable native text", () => {
  assert.equal(corruptedText("ƉƌĞǌǌŝĂƌŝŽ\x03Ěŝ\x03>ĞĐĐŽ"), true);
  assert.equal(
    corruptedText(
      "Prezziario di Lecco: €/m², qualità media, città, più piani.",
    ),
    false,
  );
});

test("candidate detection includes continuation tables without repeated unit headings", () => {
  assert.equal(
    candidatePage({
      text: Array.from(
        { length: 8 },
        (_, i) => `Comune ${i}   100,00  200,00`,
      ).join("\n"),
    }),
    true,
  );
  assert.equal(
    candidatePage({
      text: "Indice generale del documento e riferimenti normativi.",
    }),
    false,
  );
});
test("fragment coverage requires all descendants and matching content", () => {
  const root = {
    _file: "a.json",
    split: true,
    children: [{ file: "/cache/a-part1.json", contentHash: "h" }],
  };
  const part = {
    _file: "a-part1.json",
    contentHash: "h",
    split: true,
    children: [{ file: "/cache/a-part1-part1.json", contentHash: "h" }],
  };
  const index = new Map([
    ["a.json", root],
    ["a-part1.json", part],
  ]);
  assert.equal(completeBatch(root, index), false);
  index.set("a-part1-part1.json", {
    _file: "a-part1-part1.json",
    contentHash: "wrong",
  });
  assert.equal(completeBatch(root, index), false);
  index.set("a-part1-part1.json", {
    _file: "a-part1-part1.json",
    contentHash: "h",
  });
  assert.equal(completeBatch(root, index), true);
  part.children = [{ file: "a.json", contentHash: undefined }];
  assert.equal(completeBatch(root, index), false);
});
test("audit context fingerprints change when target or neighbouring headers change", () => {
  const source = { pages: [{ text: "unità €/m²" }, { text: "Deposito 165" }] };
  const before = hash(auditContext(source, 2));
  source.pages[0].text = "unità lire/m²";
  assert.notEqual(before, hash(auditContext(source, 2)));
  assert.ok(auditContext(source, 2).startsWith("PAGINA 2 TARGET"));
});
