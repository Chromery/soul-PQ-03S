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
  matchingMunicipalities,
  workedExamplePage,
  nonBuildingVolume,
  onlyPageFurniture,
  comoTerritorialCells,
  fvgLandRows,
} from "./lib.mjs";

test("FVG land keeps the five min/max columns and never shifts a missing pair", () => {
  const rules = fvgLandRows(
    "PORDENONE    3  8  10  25  15  30  20  35  25  45\nARBA    2  6  5  10  -  -  10  20  10  20\nTRIESTE - Z.C. 1    -  -  15  30  20  35  20  40  30  70\nMIN MAX MIN MAX MIN MAX MIN MAX MIN MAX",
  );
  assert.equal(rules.length, 13);
  assert.equal(rules[0].valueMin, 3);
  assert.equal(rules[0].valueMax, 8);
  assert.equal(rules[0].unit, "m2");
  const arba = rules.filter((r) => r.label.includes("ARBA"));
  assert.equal(arba[2].code, "FVG-SUOLO-4");
  assert.equal(arba[2].valueMax, 20);
  const trieste = rules.filter((r) => r.label.includes("TRIESTE"));
  assert.equal(trieste[0].code, "FVG-SUOLO-2");
  assert.equal(trieste[0].valueMin, 15);
  assert.match(trieste[0].qualifiers, /Z.C. 1/);
});

test("Como static cells preserve ranges and suspicious originals without executing formulas or guessing units", () => {
  const rules = comoTerritorialCells(
    "A4: COMUNE | B4: PERIFERICA E\nA5: ALBAVILLA | B5: 15 - 30 | C5: 25 - 45 | D5: -\nA8: ALTA VALLE INTELVI | B8: 45931 | C8: [formula, non prezzo autonomo] 25",
  );
  assert.equal(rules.length, 3);
  assert.equal(rules[0].code, "B5");
  assert.equal(rules[0].valueMin, 15);
  assert.equal(rules[0].valueMax, 30);
  assert.equal(rules[0].quote, "B5: 15 - 30");
  assert.equal(rules[0].currency, "unknown");
  assert.equal(rules[0].unit, "other");
  assert.equal(rules[2].valueMin, 45931);
});

test("page furniture detection never skips numbers with a price or unit", () => {
  assert.equal(
    onlyPageFurniture(
      "Categorie Speciali e Particolari - Prontuario Regionale del Piemonte - Appendice Dicembre 2025\n14",
    ),
    true,
  );
  assert.equal(onlyPageFurniture("14"), false);
  for (const text of [
    "Costo 14",
    "14 €/mq",
    "14 EUR/m2",
    "€/mq\n14",
    "Capannone\n150",
  ])
    assert.equal(onlyPageFurniture(text), false, text);
});

test("worked valuations and hydraulic volumes are not ordinary building tariffs", () => {
  for (const text of [
    "9. Esempi applicativi calcolo rendita catastale\nSuperficie 750 155 116.250",
    "ESEMPIO 4\nStima fabbricato",
    "ACCERTAMENTO DELLA PROPRIETA' IMMOBILIARE URBANA mod. 2NB - parte I",
    "Tipologia coeff. vetustà €/mq ragguagliati deprezzato",
  ])
    assert.equal(workedExamplePage(text), true, text);
  assert.equal(
    workedExamplePage(
      "Tabella costi costruzione\nCapannoni 150 €/mq\nSi veda l'esempio di calcolo in appendice",
    ),
    false,
  );
  for (const label of [
    "Diga in c.a.",
    "Gallerie ed opere di presa",
    "Pozzo piezometrico per centrale idroelettrica",
  ])
    assert.equal(nonBuildingVolume(label), true, label);
  assert.equal(
    nonBuildingVolume(
      "Fabbricati ospitanti centrali idroelettriche, costruiti in caverna/galleria",
    ),
    false,
  );
  assert.equal(nonBuildingVolume("Palazzina uffici"), false);
});

test("municipal scope preserves lists without confusing nested names or exclusions", () => {
  const names = ["Garda", "Castelnuovo del Garda", "Bergamo", "Milano"];
  assert.deepEqual(
    matchingMunicipalities("Terreno Castelnuovo del Garda", names),
    ["Castelnuovo del Garda"],
  );
  assert.deepEqual(
    matchingMunicipalities("Comuni di Castelnuovo del Garda e Garda", names),
    ["Castelnuovo del Garda", "Garda"],
  );
  assert.deepEqual(
    matchingMunicipalities("Comuni di Milano e Bergamo", names).sort(),
    ["Bergamo", "Milano"],
  );
  assert.deepEqual(
    matchingMunicipalities("Altri comuni, eccetto Milano", names),
    [],
  );
  assert.deepEqual(matchingMunicipalities("Milanello", names), []);
});

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
        (_, i) => `Comune ${i}    3    8    15    30`,
      ).join("\n"),
    }),
    true,
  );
  assert.equal(
    candidatePage({
      text: Array.from(
        { length: 8 },
        (_, i) => `Comune ${i} 15 - 30 25 - 45 45 - 60`,
      ).join("\n"),
    }),
    true,
  );
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
