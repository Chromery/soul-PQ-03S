import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMAPS_CATALOG_METADATA,
  resolveFormapsTerritory,
} from "../src/formaps-territories/formaps-territory-resolver.js";
import { VisuraExtractionService } from "../src/visura-extraction/visura-extraction.service.js";

test("carica il catalogo completo salvato dagli endpoint forMaps", () => {
  assert.equal(FORMAPS_CATALOG_METADATA.provinceCount, 101);
  assert.equal(FORMAPS_CATALOG_METADATA.municipalityCount, 8_900);
  assert.match(FORMAPS_CATALOG_METADATA.sha256, /^[a-f0-9]{64}$/);
});

test("risolve match esatti anche con accenti e apostrofi differenti", () => {
  const result = resolveFormapsTerritory("AG", "Canicattì");
  assert.equal(result.exactMatch, true);
  assert.equal(result.strategy, "exact");
  assert.equal(result.selected?.provinceId, "AG");
  assert.equal(result.selected?.municipalityId, "B602");
  assert.equal(result.selected?.municipality, "CANICATTI'");
});

test("converte province amministrative nuove nelle province catastali forMaps", () => {
  const monza = resolveFormapsTerritory("MB", "Monza");
  assert.equal(monza.strategy, "normalized");
  assert.equal(monza.selected?.provinceId, "MI");
  assert.equal(monza.selected?.municipality, "MONZA");

  const cesena = resolveFormapsTerritory("FC", "Cesena/sez.B");
  assert.equal(cesena.strategy, "normalized");
  assert.equal(cesena.selected?.provinceId, "FO");
  assert.equal(cesena.selected?.municipalityId, "C573B");

  const carrara = resolveFormapsTerritory("Massa-Carrara", "Carrara");
  assert.equal(carrara.selected?.provinceId, "MS");
  assert.equal(carrara.selected?.province, "MASSA");
});

test("corregge un comune simile quando il primo candidato è sufficientemente distinto", () => {
  const result = resolveFormapsTerritory("Como", "Casnate con Bernte/sez.B");
  assert.equal(result.strategy, "fuzzy");
  assert.equal(result.selected?.provinceId, "CO");
  assert.equal(result.selected?.municipality, "CASNATE CON BERNATE/sez.B");
  assert.ok((result.selected?.score ?? 0) > 0.9);
});

test("non inventa la sezione quando più voci forMaps sono equivalenti", () => {
  const result = resolveFormapsTerritory("FC", "Cesena");
  assert.equal(result.strategy, "ambiguous");
  assert.equal(result.selected, null);
  assert.deepEqual(
    result.candidates.slice(0, 2).map((candidate) => candidate.municipalityId),
    ["C573A", "C573B"],
  );
});

test("non inventa la sezione nemmeno quando la provincia coincide esattamente", () => {
  for (const [province, municipality] of [["VE", "Venezia"], ["BA", "Bari"]]) {
    const result = resolveFormapsTerritory(province, municipality);
    assert.equal(result.strategy, "ambiguous");
    assert.equal(result.selected, null);
    assert.ok(result.candidates.length > 1);
  }
});

test("preferisce la voce comunale senza sezione quando forMaps la espone", () => {
  const result = resolveFormapsTerritory("BG", "Bergamo");
  assert.equal(result.strategy, "exact");
  assert.equal(result.selected?.municipalityId, "A794");
  assert.equal(result.selected?.municipality, "BERGAMO");
});

test("non chiama NeuralWatt quando provincia e comune hanno un match esatto", async () => {
  const service = extractionService({
    found: true,
    provincia: "MI",
    comune: "Abbiategrasso",
    foglio: "1",
    particella: "2",
    confidence: 0.95,
    evidence: "Comune di Abbiategrasso; Provincia di Milano; Foglio: 1 Particella: 2",
    warnings: [],
  });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("NeuralWatt non doveva essere chiamato");
  };
  try {
    const result = await service.extractFromBase64(pdfInput());
    assert.equal(result.provincia, "MI");
    assert.equal(result.comune, "ABBIATEGRASSO");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NeuralWatt riceve solo la shortlist e può risolvere un caso ambiguo", async () => {
  const service = extractionService({
    found: true,
    provincia: "FC",
    comune: "Cesena",
    foglio: "10",
    particella: "20",
    confidence: 0.9,
    evidence: "Comune di Cesena; la sezione catastale indicata è B; Provincia di Forlì-Cesena; Foglio: 10 Particella: 20",
    warnings: [],
  });
  const originalFetch = globalThis.fetch;
  let sentCandidates: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = request.messages.find((message) => message.role === "user");
    const payload = JSON.parse(userMessage?.content ?? "{}") as { candidates?: unknown[] };
    sentCandidates = payload.candidates ?? [];
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ municipalityId: "C573B" }) } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await service.extractFromBase64(pdfInput());
    assert.ok(sentCandidates.length > 1 && sentCandidates.length <= 8);
    assert.equal(result.provincia, "FO");
    assert.equal(result.comune, "CESENA/sez.B");
    assert.ok(result.warnings.some((warning) => warning.includes("NeuralWatt su shortlist")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("i valori canonici estratti dalla visura sostituiscono comune e provincia ERP non affidabili", async () => {
  let updateData: Record<string, unknown> | null = null;
  const transaction = {
    property: {
      findUnique: async () => ({
        address: "Via Test 1",
        comune: "Comune scritto male",
        provincia: "XX",
        ubicazione: "Via Test 1",
        foglio: null,
        particella: null,
      }),
      update: async (input: { data: Record<string, unknown> }) => {
        updateData = input.data;
      },
    },
  };
  const service = new VisuraExtractionService(
    { get: () => undefined } as never,
    { $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction) } as never,
  );
  await (service as unknown as {
    persistExtractedCadastralData: (propertyId: string, result: Record<string, unknown>) => Promise<void>;
  }).persistExtractedCadastralData("I-1", {
    found: true,
    provincia: "CO",
    comune: "CASNATE CON BERNATE/sez.B",
    foglio: "4",
    particella: "370",
    confidence: 0.9,
    evidence: null,
    warnings: [],
  });

  assert.equal(updateData?.provincia, "CO");
  assert.equal(updateData?.comune, "CASNATE CON BERNATE/sez.B");
  assert.equal(updateData?.foglio, "4");
  assert.equal(updateData?.particella, "370");
});

test("un territorio non risolto non sovrascrive comune e provincia ERP esistenti", async () => {
  let updateData: Record<string, unknown> | null = null;
  const transaction = {
    property: {
      findUnique: async () => ({
        address: "Via Test 1",
        comune: "Milano",
        provincia: "MI",
        ubicazione: "Via Test 1",
        foglio: null,
        particella: null,
      }),
      update: async (input: { data: Record<string, unknown> }) => {
        updateData = input.data;
      },
    },
  };
  const service = new VisuraExtractionService(
    { get: () => undefined } as never,
    { $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction) } as never,
  );
  await (service as unknown as {
    persistExtractedCadastralData: (propertyId: string, result: Record<string, unknown>) => Promise<void>;
  }).persistExtractedCadastralData("I-1", {
    found: true,
    provincia: "XX",
    comune: "Testo OCR non riconoscibile",
    foglio: "4",
    particella: "370",
    confidence: 0.4,
    evidence: null,
    warnings: [],
  });

  assert.equal(updateData?.provincia, "MI");
  assert.equal(updateData?.comune, "Milano");
});

function extractionService(result: Record<string, unknown>) {
  const config = {
    get: (name: string) => {
      if (name === "NEURALWATT_API_KEY") return "test-neuralwatt-key";
      if (name === "NEURALWATT_TERRITORY_MATCH_ENABLED") return "true";
      return undefined;
    },
  };
  const service = new VisuraExtractionService(config as never, {} as never);
  Object.assign(service as object, {
    callOpenRouterVisuraExtraction: async () => JSON.stringify({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }),
  });
  return service;
}

function pdfInput() {
  return {
    fileName: "visura-test.pdf",
    fileBase64: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"),
  };
}
