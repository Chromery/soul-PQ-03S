import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { priceRuleLocation } from "../../web/src/price-rule-location.js";
import {
  calculatePriceProposal,
  suggestPriceRules,
} from "../src/price-lists/price-rules.engine.js";
import { parsePriceQuery } from "../src/price-lists/price-rules.controller.js";
import {
  priceCsvCell,
  PriceRulesService,
} from "../src/price-lists/price-rules.service.js";
import type {
  PriceCatalog,
  PriceDocument,
  PriceRule,
} from "../src/price-lists/price-rules.types.js";

const doc: PriceDocument = {
  id: "a".repeat(64),
  sha256: "a".repeat(64),
  file: "Milano.pdf",
  aliases: [],
  format: "pdf",
  title: "Milano",
  territory: "Milano",
  province: "MI",
  region: "Lombardia",
  year: 2017,
  epoch: "1988-1989",
  includesCharges: true,
  historical: false,
  role: "price-list",
  pages: 16,
  processedPages: 10,
  candidatePages: 10,
  ocrPages: 0,
  rules: 1,
  usableRules: 1,
  reviewRules: 0,
  status: "extracted",
  notes: [],
};
const rule: PriceRule = {
  id: "rule",
  documentId: doc.id,
  page: 7,
  code: "2.4",
  label: "Capannone luce fino a 15 m",
  usageIds: ["capannone"],
  kind: "building",
  currency: "EUR",
  unit: "m2",
  valueMin: 165,
  valueMax: null,
  qualifiers: "Altezza fino a 5 m",
  quote: "165",
  volumeKind: "none",
  ordinary: false,
  evidence: "exact",
  semanticReview: "supported",
  reviewReasons: [],
  method: "text",
};
const catalog: PriceCatalog = {
  version: "test",
  generatedAt: "",
  model: "",
  promptHash: "",
  documents: [doc],
  rules: [rule],
  bergamoZones: { bergamo: "A" },
  totals: {
    files: 1,
    documents: 1,
    pages: 16,
    rules: 1,
    exactRules: 1,
    reviewRules: 0,
  },
};

test("price rules: grouped editors only prefill a shared locality, never the first property", () => {
  assert.deepEqual(
    priceRuleLocation([
      { provincia: "MI", comune: "Milano" },
      { provincia: "BG", comune: "Bergamo" },
    ]),
    { province: undefined, municipality: undefined, ambiguous: true },
  );
  assert.deepEqual(
    priceRuleLocation([
      { provincia: "MI", comune: "Milano" },
      { provincia: "MI", comune: "Rho" },
    ]),
    { province: "MI", municipality: undefined, ambiguous: true },
  );
  assert.deepEqual(
    priceRuleLocation([
      { provincia: "MI", comune: "Milano" },
      { provincia: "mi", comune: "MILANO" },
    ]),
    { province: "MI", municipality: "Milano", ambiguous: false },
  );
  assert.deepEqual(
    priceRuleLocation([
      {
        provincia: "MI",
        comune: "Milano",
        formapsProvincia: "BG",
        formapsComune: "Bergamo",
      },
    ]),
    { province: "BG", municipality: "Bergamo", ambiguous: false },
  );
  assert.equal(
    priceRuleLocation([
      { provincia: "MI", comune: "Milano" },
      { comune: "Milano" },
    ]).municipality,
    undefined,
  );
});

test("price rules: Milano preserves base, charges and capped height correction", () => {
  assert.equal(calculatePriceProposal(rule, doc, {}).suggested, 165);
  assert.equal(
    calculatePriceProposal(rule, doc, { height: 6 }).suggested,
    173.25,
  );
  assert.equal(
    calculatePriceProposal(rule, doc, { height: 12 }).suggested,
    181.5,
  );
  assert.equal(calculatePriceProposal(rule, doc, {}).includesCharges, true);
  assert.ok(
    calculatePriceProposal(rule, doc, {}).assumptions.some((v) =>
      v.includes("non ancora nota"),
    ),
  );
});
test("price rules: volume requires explicit height; capacity and each are not m2", () => {
  const volume = {
    ...rule,
    unit: "m3" as const,
    volumeKind: "building" as const,
    code: "3.1",
    valueMin: 155,
  };
  assert.equal(calculatePriceProposal(volume, doc, {}).applicable, false);
  assert.equal(calculatePriceProposal(volume, doc, {}).suggested, null);
  assert.equal(
    calculatePriceProposal(volume, doc, { height: 3 }).suggested,
    465,
  );
  assert.equal(
    calculatePriceProposal({ ...volume, volumeKind: "capacity" }, doc, {
      height: 3,
    }).applicable,
    false,
  );
  assert.equal(
    calculatePriceProposal({ ...rule, unit: "each" }, doc, {}).applicable,
    false,
  );
  assert.equal(
    calculatePriceProposal({ ...rule, unit: "m" }, doc, {}).applicable,
    false,
  );
});
test("price rules: lire conversion is fixed and ranges explicitly use a midpoint", () => {
  const proposal = calculatePriceProposal(
    { ...rule, code: "", currency: "ITL", valueMin: 193627, valueMax: 387254 },
    doc,
    {},
  );
  assert.equal(proposal.min, 100);
  assert.equal(proposal.max, 200);
  assert.equal(proposal.suggested, 150);
  assert.ok(
    proposal.assumptions.some((v) =>
      v.includes("non un prezzo statisticamente"),
    ),
  );
});
test("price rules: review, unknown currency, context, calculators, equipment never apply", () => {
  for (const r of [
    { ...rule, evidence: "review" as const },
    { ...rule, currency: "unknown" as const },
    { ...rule, kind: "equipment" as const },
    { ...rule, semanticReview: undefined },
    { ...rule, semanticReview: "review" as const },
    { ...rule, semanticReview: "pending" as const },
  ])
    assert.equal(calculatePriceProposal(r, doc, {}).applicable, false);
  for (const role of ["context", "calculator"] as const)
    assert.equal(
      calculatePriceProposal(rule, { ...doc, role }, {}).applicable,
      false,
    );
});
test("price rules: province and usage are mandatory constraints, no nearest-territory fallback", () => {
  assert.equal(suggestPriceRules(catalog, {}).total, 0);
  assert.equal(
    suggestPriceRules(catalog, { province: "BG", usage: "capannone" }).total,
    0,
  );
  assert.equal(
    suggestPriceRules(catalog, { province: "MI", usage: "uffici" }).total,
    0,
  );
  assert.equal(
    suggestPriceRules(catalog, { province: "MI", usage: "capannone" }).total,
    1,
  );
  assert.equal(
    suggestPriceRules(catalog, { province: "BG", documentId: doc.id }).total,
    1,
  );
});
test("price rules: municipal prices and zones require location, filter others", () => {
  for (const municipality of ["—", " (MI)", "Bergamo"])
    assert.equal(
      calculatePriceProposal(
        { ...rule, municipalities: ["Milano", "Rho"] },
        doc,
        { municipality },
      ).applicable,
      false,
    );
  const multi = {
    ...catalog,
    rules: [{ ...rule, municipalities: ["Milano", "Rho"] }],
  };
  assert.equal(
    suggestPriceRules(multi, { documentId: doc.id, municipality: "Rho" }).total,
    1,
  );
  assert.equal(
    suggestPriceRules(multi, { documentId: doc.id, municipality: "Bergamo" })
      .total,
    0,
  );
  assert.equal(
    suggestPriceRules(multi, { documentId: doc.id }).items[0].proposal
      .applicable,
    false,
  );
  const local = { ...catalog, rules: [{ ...rule, municipality: "Varese" }] };
  assert.equal(
    suggestPriceRules(local, { documentId: doc.id }).items[0].proposal
      .applicable,
    false,
  );
  assert.equal(
    suggestPriceRules(local, { documentId: doc.id, municipality: "VARESE" })
      .items[0].proposal.applicable,
    true,
  );
  assert.equal(
    suggestPriceRules(local, { documentId: doc.id, municipality: "Como" })
      .total,
    0,
  );
  const zoned = {
    ...catalog,
    documents: [{ ...doc, province: "BG" }],
    rules: [{ ...rule, zone: "A" }],
  };
  assert.equal(
    suggestPriceRules(zoned, { province: "BG" }).items[0].proposal.applicable,
    false,
  );
  assert.equal(
    suggestPriceRules(zoned, { province: "BG", municipality: "Bergamo" })
      .items[0].proposal.applicable,
    true,
  );
  assert.equal(
    suggestPriceRules(zoned, { province: "BG", zone: "E" }).total,
    0,
  );
});
test("price rules: Milano span selects the documented variant, not an invented extrapolation", () => {
  const variants = {
    ...catalog,
    rules: [165, 214, 248].map((price, i) => ({
      ...rule,
      id: String(i),
      valueMin: price,
    })),
  };
  assert.equal(
    suggestPriceRules(variants, { province: "MI", span: 19 }).items[0].valueMin,
    214,
  );
  assert.equal(
    suggestPriceRules(variants, { province: "MI", span: 31 }).total,
    0,
  );
});
test("price rules: historical and unverified variants are opt-in; review remains non-applicable", () => {
  const variants = {
    ...catalog,
    documents: [{ ...doc, historical: true }],
    rules: [{ ...rule, evidence: "review" as const }],
  };
  assert.equal(suggestPriceRules(variants, { province: "MI" }).total, 0);
  const result = suggestPriceRules(variants, {
    province: "MI",
    historical: true,
    review: true,
  });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].proposal.applicable, false);
});
test("price rules: strict query validation rejects arrays, injection and invalid dimensions", () => {
  for (const query of [
    { province: ["MI"] },
    { province: "../" },
    { usage: "INVALID" },
    { height: "0" },
    { height: "NaN" },
    { limit: "10000" },
    { limit: "2.5" },
    { documentId: "../../.env" },
    { review: "1" },
    { bogus: "x" },
    { search: "x".repeat(251) },
  ])
    assert.throws(() => parsePriceQuery(query));
  assert.deepEqual(
    parsePriceQuery({
      province: "MI",
      height: "3.5",
      review: "false",
      limit: "12",
    }),
    { province: "MI", height: 3.5, review: false, limit: 12 },
  );
});
test("price rules: generated catalog integrity, source linkage and safe supported units", () => {
  const generated: PriceCatalog = JSON.parse(
    readFileSync(
      new URL(
        "../src/price-lists/data/catalog.generated.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.ok(generated.documents.length >= 108);
  assert.equal(
    generated.documents.find((d) => d.file === "Firenze/doc_data.txt")
      ?.province,
    "FI",
  );
  assert.equal(
    generated.documents.find((d) => d.file === "Como/doc_data.txt")?.province,
    "CO",
  );
  assert.equal(
    new Set(generated.rules.map((r) => r.id)).size,
    generated.rules.length,
  );
  const docs = new Map(generated.documents.map((d) => [d.id, d]));
  for (const item of generated.rules) {
    const source = docs.get(item.documentId)!;
    assert.ok(source);
    assert.ok(item.page > 0 && item.page <= source.pages);
    assert.ok(Number.isFinite(item.valueMin) && item.valueMin >= 0);
    const proposal = calculatePriceProposal(item, source, {});
    if (proposal.applicable) {
      assert.equal(item.evidence, "exact");
      assert.ok(["building", "land", "site-work"].includes(item.kind));
      assert.equal(item.unit, "m2");
    }
    if (item.evidence === "review") assert.ok(item.reviewReasons.length > 0);
  }
  const milano = suggestPriceRules(generated, {
    province: "MI",
    usage: "capannone",
    span: 15,
  });
  assert.ok(milano.items.some((r) => r.valueMin === 165 && r.code === "2.4"));
});

test("price rules: worked examples and hydraulic component volumes stay quarantined", () => {
  const generated: PriceCatalog = JSON.parse(
    readFileSync(
      new URL(
        "../src/price-lists/data/catalog.generated.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const ancona = generated.documents.find(
    (d) => d.file === "Ancona PRONTUARIO_AN-2019.pdf",
  )!;
  const examples = generated.rules.filter(
    (r) => r.documentId === ancona.id && [51, 53, 55, 56].includes(r.page),
  );
  assert.ok(examples.length > 0);
  for (const r of examples)
    assert.equal(
      calculatePriceProposal(r, ancona, { height: 5 }).applicable,
      false,
      r.label,
    );
  const modena = generated.documents.find(
    (d) => d.file === "Modena prontuario 2022.pdf",
  )!;
  const dam = generated.rules.find(
    (r) => r.documentId === modena.id && r.label.startsWith("Diga in c.a."),
  )!;
  assert.ok(dam);
  assert.equal(
    calculatePriceProposal(dam, modena, { height: 5 }).applicable,
    false,
  );
  const municipal = generated.rules.find(
    (r) =>
      r.documentId === modena.id &&
      r.kind === "building" &&
      r.label.includes("Comune di Maranello"),
  )!;
  assert.ok(municipal);
  assert.equal(municipal.municipality?.toLowerCase(), "maranello");
  assert.equal(
    calculatePriceProposal(municipal, modena, { municipality: "Modena" })
      .applicable,
    false,
  );
});

test("price rules: CSV review cannot inject spreadsheet formulas", () => {
  assert.equal(priceCsvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(priceCsvCell(" @SUM(A1)"), '"\' @SUM(A1)"');
  assert.equal(priceCsvCell("Via Roma; 2"), '"Via Roma; 2"');
  assert.equal(priceCsvCell(165), '"165"');
});
test("price rules: locality normalization does not silently adopt fuzzy towns", () => {
  const service = new PriceRulesService();
  assert.equal(service.context("Milano", "Milano (MI)").province, "MI");
  assert.equal(service.context("", "Bergamo").province, "BG");
  assert.equal(service.context("", "Comune inesistente xyz").province, null);
  assert.deepEqual(service.context("CO", "COMO/sez.A").municipality, "COMO");
  assert.equal(service.context("PS", "Pesaro").province, "PU");
  assert.equal(service.context("PU", "Pesaro").province, "PU");
  const historicalCode = {
    ...catalog,
    documents: [{ ...doc, province: "PS", region: "Marche" }],
  };
  assert.equal(suggestPriceRules(historicalCode, { province: "PU" }).total, 1);
  const section = { ...catalog, rules: [{ ...rule, municipality: "Milano" }] };
  assert.equal(
    suggestPriceRules(section, { province: "MI", municipality: "MILANO/sez.A" })
      .items[0].proposal.applicable,
    true,
  );
});
test("price rules: land-inclusive building cost cannot double count the editor lot", () => {
  assert.equal(
    calculatePriceProposal({ ...rule, includesLand: true }, doc, {}).applicable,
    false,
  );
  const proposal = calculatePriceProposal(
    rule,
    { ...doc, includesLand: true },
    {},
  );
  assert.equal(proposal.applicable, false);
  assert.ok(proposal.missingInputs.some((v) => v.includes("suolo")));
});

test("price rules: pending semantic verification cannot be applied", () => {
  const pending = calculatePriceProposal(
    { ...rule, semanticReview: "pending" },
    doc,
    {},
  );
  assert.equal(pending.applicable, false);
  assert.equal(pending.suggested, null);
  assert.equal(
    calculatePriceProposal({ ...rule, semanticReview: "supported" }, doc, {})
      .applicable,
    true,
  );
});

test("price rules: Lecco interpolates the whole-building surface and applies the specific height coefficient", () => {
  const lecco: PriceRule = {
    ...rule,
    formulaDependent: true,
    calculation: {
      type: "lecco-capannone",
      base: 166,
      areaMin: 501,
      areaMax: 1600,
      coefficient: 40,
      denominator: 1100,
      referenceHeight: 4,
      heightIncreasePercent: 2.7,
    },
  };
  const source = { ...doc, file: "Lecco.pdf", includesCharges: false };
  assert.equal(calculatePriceProposal(lecco, source, {}).applicable, false);
  assert.equal(
    calculatePriceProposal(lecco, source, { area: 600, height: 4 }).suggested,
    202.36,
  );
  assert.equal(
    calculatePriceProposal(lecco, source, { area: 600, height: 5 }).suggested,
    207.83,
  );
  assert.equal(
    calculatePriceProposal(lecco, source, { area: 1600, height: 4 }).suggested,
    166,
  );
  assert.equal(
    calculatePriceProposal(lecco, source, { area: 400, height: 4 }).applicable,
    false,
  );
  assert.equal(
    calculatePriceProposal(lecco, source, { area: 600, height: 3 }).applicable,
    false,
  );
  assert.equal(
    calculatePriceProposal({ ...rule, formulaDependent: true }, doc, {})
      .applicable,
    false,
  );
});

test("price rules: whole catalog suggestions never apply quarantined or unfinished rules", () => {
  const generated: PriceCatalog = JSON.parse(
    readFileSync(
      new URL(
        "../src/price-lists/data/catalog.generated.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const province of [
    "MI",
    "BG",
    "LC",
    "FI",
    "CT",
    "BA",
    "TO",
    "UD",
    "RO",
    "TV",
    "GE",
  ]) {
    for (const usage of [
      "capannone",
      "uffici",
      "lotto",
      "sistemazione-esterna",
      "hotel",
    ] as const) {
      const result = suggestPriceRules(generated, {
        province,
        usage,
        height: 3,
        limit: 100,
        review: true,
        historical: true,
      });
      for (const item of result.items) {
        assert.ok(item.usageIds.includes(usage));
        if (usage === "uffici")
          assert.ok(!/^Capannone articolato/i.test(item.label));
        if (item.proposal.applicable) {
          assert.equal(item.evidence, "exact");
          assert.equal(item.semanticReview, "supported");
          assert.ok(
            item.proposal.suggested !== null &&
              Number.isFinite(item.proposal.suggested),
          );
          assert.ok(!item.municipality && !item.zone);
          assert.ok(!item.municipalities?.length);
        }
        if (usage === "lotto") assert.equal(item.kind, "land");
        else assert.notEqual(item.kind, "land");
      }
    }
  }
});

test("price rules: real Milano office prices do not include complete shopping centres", () => {
  const generated: PriceCatalog = JSON.parse(
    readFileSync(
      new URL(
        "../src/price-lists/data/catalog.generated.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const offices = suggestPriceRules(generated, {
    province: "MI",
    usage: "uffici",
    height: 3,
    limit: 100,
  });
  assert.ok(
    offices.items.some(
      (r) =>
        r.valueMin === 155 && r.unit === "m3" && r.proposal.suggested === 465,
    ),
  );
  assert.ok(offices.items.every((r) => !/^centro commerciale/i.test(r.label)));
  const bg = suggestPriceRules(generated, {
    province: "BG",
    municipality: "Bergamo",
    usage: "capannone",
    limit: 100,
  });
  assert.equal(bg.zone, "A");
  assert.ok(bg.items.some((r) => r.page === 49 && r.valueMin === 270));
  assert.ok(bg.items.every((r) => !r.zone || r.zone === "A"));
});

test("price rules: regional ordinary variants respect surface, height and documented edition priority", () => {
  const regional = {
    ...doc,
    id: "b".repeat(64),
    file: "regional.pdf",
    province: null,
    preferredForRegion: true,
  };
  const variant = {
    ...rule,
    documentId: regional.id,
    code: "",
    valueMin: 120,
    areaBounds: { maxInclusive: 2000 },
    heightAdjustment: { base: 5, percentPerMetre: 5, note: "Fonte pagina 16" },
  };
  assert.equal(
    calculatePriceProposal(variant, regional, { area: 600, height: 7 })
      .suggested,
    132,
  );
  assert.equal(
    calculatePriceProposal(variant, regional, { area: 2500 }).applicable,
    false,
  );
  const combined = {
    ...catalog,
    documents: [{ ...doc, file: "provincial.pdf" }, regional],
    rules: [rule, variant],
  };
  assert.equal(
    suggestPriceRules(combined, { province: "MI", usage: "capannone" }).items[0]
      .documentId,
    regional.id,
  );
  assert.equal(
    suggestPriceRules(combined, {
      province: "MI",
      usage: "capannone",
      area: 2500,
    }).items.length,
    1,
  );
  assert.equal(
    suggestPriceRules(combined, {
      province: "MI",
      usage: "capannone",
      area: 2000,
    }).items.length,
    2,
  );
});

test("price rules: concrete warehouses are not mistaken for sports facilities", () => {
  const generated: PriceCatalog = JSON.parse(
    readFileSync(
      new URL(
        "../src/price-lists/data/catalog.generated.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const d = generated.documents.find((d) =>
    d.file.endsWith("Prontuario FVG Categorie D-E_2024-vers1.2-dicem2025.pdf"),
  )!;
  const variants = generated.rules.filter(
    (r) =>
      r.documentId === d.id &&
      r.page === 16 &&
      /^(Capannone|Magazzino).*calcestruzzo/.test(r.label),
  );
  assert.equal(variants.length, 4);
  assert.ok(variants.every((r) => r.usageIds.includes("capannone")));
});
