import assert from "node:assert/strict";
import test from "node:test";
import { PriceListsService } from "../src/price-lists/price-lists.service.js";

test("il matching dei prezzari usa la provincia dell'immobile invece di quella dello studio", async () => {
  const created: Array<{ priceListId: string; rank: number; reason: string }> = [];
  const property = {
    id: "1554659",
    comune: "CALESTANO",
    provincia: "PR",
    address: "CALESTANO(PR) VIA GIOVANNI BATTILOCCHI",
    study: { provincia: "Vicenza", region: "" },
  };
  const priceLists = [
    {
      id: "parma",
      comune: null,
      provincia: "PR",
      region: "Emilia-Romagna",
      latitude: 44.8015,
      longitude: 10.3279,
      year: 2019,
      priority: 50,
    },
    {
      id: "vicenza",
      comune: null,
      provincia: "VI",
      region: "Veneto",
      latitude: 45.5455,
      longitude: 11.5354,
      year: 2024,
      priority: 50,
    },
  ];
  const prisma = {
    property: {
      findUnique: async () => property,
    },
    priceList: {
      findMany: async () => priceLists,
    },
    propertyPriceList: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      create: ({ data }: { data: { priceListId: string; rank: number; reason: string } }) => {
        created.push(data);
        return Promise.resolve(data);
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };

  const service = new PriceListsService(prisma as never, {} as never);
  await service.assignForProperty(property.id);

  assert.equal(created[0]?.priceListId, "parma");
  assert.equal(created[0]?.rank, 1);
  assert.equal(created[0]?.reason, "Provincia corrispondente");
});

test("il matching ricava la provincia dal comune quando il dato dell'immobile manca", async () => {
  const created: Array<{ priceListId: string; rank: number; reason: string }> = [];
  const property = {
    id: "castenaso",
    comune: "CASTENASO",
    provincia: "",
    address: "VIA ROMA 1",
    study: { provincia: "Milano", region: "Lombardia" },
  };
  const priceLists = [
    {
      id: "bologna",
      comune: null,
      provincia: "BO",
      region: "Emilia-Romagna",
      latitude: 44.4949,
      longitude: 11.3426,
      year: 2024,
      priority: 40,
    },
    {
      id: "milano",
      comune: null,
      provincia: "MI",
      region: "Lombardia",
      latitude: 45.4642,
      longitude: 9.19,
      year: 2025,
      priority: 40,
    },
  ];
  const prisma = {
    property: { findUnique: async () => property },
    priceList: { findMany: async () => priceLists },
    propertyPriceList: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      create: ({ data }: { data: { priceListId: string; rank: number; reason: string } }) => {
        created.push(data);
        return Promise.resolve(data);
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };

  const service = new PriceListsService(prisma as never, {} as never);
  await service.assignForProperty(property.id);

  assert.equal(created[0]?.priceListId, "bologna");
  assert.equal(created[0]?.reason, "Provincia corrispondente");
});
