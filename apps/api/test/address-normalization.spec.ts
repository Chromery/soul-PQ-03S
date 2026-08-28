import assert from "node:assert/strict";
import test from "node:test";
import {
  AddressNormalizationService,
  fallbackHumanReadableAddress,
} from "../src/address-normalization/address-normalization.service.js";

test("la normalizzazione indirizzo usa deepseek-v4-flash e legge il JSON NeuralWatt", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestedModel = "";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    requestedModel = body.model;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "{\"address\":\"Via delle Industrie 44\"}" } }],
    }), { status: 200 });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const config = {
    get: (key: string) => key === "NEURALWATT_API_KEY" ? "test-key" : undefined,
  };
  const service = new AddressNormalizationService(config as never);
  const address = await service.normalize({
    address: "BERGAMO(BG) VIA DELLE INDUSTRIE N. 44",
    comune: "BERGAMO",
    provincia: "BG",
  });

  assert.equal(requestedModel, "deepseek-v4-flash");
  assert.equal(address, "Via delle Industrie 44");
});

test("il fallback locale rimuove comune, provincia e dettagli catastali", () => {
  assert.equal(
    fallbackHumanReadableAddress({
      ubicazione: "BERGAMO(BG) VIA DELLE INDUSTRIE 44 Piano T",
      comune: "BERGAMO",
      provincia: "BG",
    }),
    "Via delle Industrie 44",
  );
});
