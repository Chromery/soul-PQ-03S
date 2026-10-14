import assert from "node:assert/strict";
import test from "node:test";
import { PriceListsService, rankPriceLists } from "../src/price-lists/price-lists.service.js";

test("Roma 2025 is preferred to 1995 for RM properties, not for a different province", () => {
  const base = { comune:null, provincia:"RM", region:"Lazio", latitude:null, longitude:null, priority:40 };
  const sources = [{...base,id:"roma-1995",year:1995},{...base,id:"roma-2025",year:2025}];
  const property = {comune:"FIUMICINO",provincia:"RM",address:"",study:{provincia:"MI",region:"Lombardia"}};
  const matches = rankPriceLists(property as never, sources as never);
  assert.equal(matches[0].priceList.id,"roma-2025");
  assert.equal(matches[0].reason,"Provincia corrispondente");
  assert.equal(sources[0].id,"roma-1995");
  assert.ok(!rankPriceLists({...property,comune:"MILANO",provincia:"MI"} as never,sources as never)
    .some(m=>m.reason === "Provincia corrispondente"));
});

test("startup backfill is non-blocking and only targets missing associations", async () => {
  let queries = 0, filter: unknown;
  const prisma = { priceList: { findMany: async () => [{ id: "fixture" }] },
    property: { findMany: async (input: any) => { queries++; filter = input.where; return []; } } };
  const service = new PriceListsService(prisma as never, {} as never);
  assert.equal(service.onModuleInit(), undefined);
  assert.equal(queries, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries, 1);
  assert.deepEqual(filter, { priceLists: { none: {} } });
});

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
