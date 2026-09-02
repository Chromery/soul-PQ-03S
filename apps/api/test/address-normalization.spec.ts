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

test("la coda di normalizzazione limita le richieste NeuralWatt concorrenti", async (context) => {
  const originalFetch = globalThis.fetch;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let fetchCalls = 0;
  const responders: Array<() => void> = [];
  globalThis.fetch = async () => new Promise<Response>((resolve) => {
    fetchCalls++;
    activeRequests++;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    responders.push(() => {
      activeRequests--;
      resolve(new Response(JSON.stringify({
        choices: [{ message: { content: "{\"address\":\"Via normalizzata 1\"}" } }],
      }), { status: 200 }));
    });
  });
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const config = {
    get: (key: string) => {
      if (key === "NEURALWATT_API_KEY") return "test-key";
      if (key === "NEURALWATT_ADDRESS_BACKGROUND_CONCURRENCY") return "2";
      return undefined;
    },
  };
  const service = new AddressNormalizationService(config as never);
  const queued = Array.from({ length: 5 }, (_, index) => service.normalizeInBackground({
    address: `MILANO(MI) VIA TEST ${index + 1}`,
    comune: "MILANO",
    provincia: "MI",
  }));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 2);
  assert.equal(maxActiveRequests, 2);

  while (fetchCalls < queued.length || responders.length > 0) {
    const currentResponders = responders.splice(0);
    currentResponders.forEach((respond) => respond());
    await new Promise((resolve) => setImmediate(resolve));
  }
  const normalized = await Promise.all(queued);

  assert.equal(fetchCalls, 5);
  assert.equal(maxActiveRequests, 2);
  assert.deepEqual(normalized, Array(5).fill("Via normalizzata 1"));
});
