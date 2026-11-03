import assert from "node:assert/strict";
import test from "node:test";
import { PresentationsService } from "../src/presentations/presentations.service.js";
import { presentationRent } from "../src/presentations/shared-presentation-values.js";
import { StudiesService } from "../src/studies/studies.service.js";
import { ImuService } from "../src/imu/imu.service.js";

const property = { id: "p1", studyId: "s1", categoria: "D/8", comune: "Napoli", provincia: "NA",
  imuRateOverride: 1.06, imuMultiplierOverride: 65, currentRendita: 1461346, estimatedRendita: 1344000,
  estimatedImu: null, currentImu: null, hasStudy: true, documents: [], priceLists: [], outcome: "Positivo" };
function fixture() {
  const records = new Map<string, any>([
    ["study:s1", { revision: 1, overrides: { clientName: "Società", "p1:renditaAttribuibile": "1387860.00" } }],
    ["group:g1", { revision: 1, overrides: { clientName: "Portafoglio", tableLayout: "paginated", "p1:renditaAttribuibile": "900000" } }],
  ]);
  const touched: string[] = [];
  const db: any = {
    feasibilityStudy: { findUnique: async () => ({ studyGroupId: "g1", properties: [property] }),
      updateMany: async ({where}: any) => { touched.push(...where.id.in); return {count: 1}; } },
    studyGroup: { findUnique: async () => ({ studies: [{ id: "s1", properties: [property] }] }) },
    presentationDraft: {
      findUnique: async ({where}: any) => structuredClone(records.get(where.id) ?? null),
      findUniqueOrThrow: async ({where}: any) => structuredClone(records.get(where.id)),
      upsert: async ({where,create}: any) => { if (!records.has(where.id)) records.set(where.id, {...create,revision:0}); },
      updateMany: async ({where,data}: any) => { const record = records.get(where.id);
        if (record.revision !== where.revision) return {count:0};
        records.set(where.id, {revision: record.revision + 1, overrides: data.overrides}); return {count:1}; },
    },
  };
  db.$transaction = async (work: any) => work(db);
  return { records, touched, api: new PresentationsService(db, {} as never, {} as never, { get: (_:string,f:unknown) => f } as never) };
}

test("rent and descriptive edits flow both ways; covers stay local; resetting restores the automatic estimate", async () => {
  const {api,records,touched} = fixture();
  assert.equal((await api.getDraft({studyGroupId:"g1"})).overrides["p1:renditaAttribuibile"], "1387860.00");
  await api.patchDraft({studyId:"s1"}, {changes:{"p1:renditaAttribuibile":"1200000", "p1:indirizzo":"Via corretta", "p1:highlight":"true", clientName:"Nuova copertina"}});
  const group = await api.getDraft({studyGroupId:"g1"});
  assert.equal(group.overrides["p1:renditaAttribuibile"], "1200000");
  assert.equal(group.overrides["p1:imuOttenibile"], "868140.00");
  assert.equal(group.overrides["p1:indirizzo"], "Via corretta");
  assert.equal(group.overrides["p1:highlight"], "true");
  assert.equal(group.overrides.clientName, "Portafoglio");
  assert.equal(group.overrides.tableLayout, "paginated");
  await api.patchDraft({studyGroupId:"g1"}, {changes:{"p1:renditaAttribuibile":"1100000", "p1:imuOttenibile":"1"}});
  const individual = await api.getDraft({studyId:"s1"});
  assert.equal(individual.overrides["p1:renditaAttribuibile"], "1100000");
  assert.equal(individual.overrides["p1:imuOttenibile"], "795795.00");
  assert.equal(individual.overrides.clientName, "Nuova copertina");
  assert.equal(individual.overrides.tableLayout, undefined);
  await api.patchDraft({studyId:"s1"}, {changes:{"p1:imuOttenibile":"750000"}});
  assert.equal((await api.getDraft({studyGroupId:"g1"})).overrides["p1:imuOttenibile"], "750000");
  await api.patchDraft({studyId:"s1"}, {changes:{"p1:renditaAttribuibile":null}});
  for (const record of records.values()) {
    assert.equal(record.overrides["p1:renditaAttribuibile"], undefined);
    assert.equal(record.overrides["p1:imuOttenibile"], undefined);
  }
  assert.deepEqual(touched, ["s1","s1","s1"]);
});

test("manual rent uses the forecast tax parameters even without a previous estimate and supports zero", () => {
  const studies: any = new StudiesService({} as never, {} as never, new ImuService());
  const input = { ...property, estimatedRendita:0, hasStudy:false, currentImuRateOverride:0.5, currentImuMultiplierOverride:80 };
  const result = studies.toApiProperty(input, false, 1000);
  assert.equal(result.estimatedRendita, 1000);
  assert.equal(result.estimatedRenditaBase, 0);
  assert.equal(result.estimatedImu, 723.45);
  assert.equal(result.hasManualEstimatedRendita, true);
  assert.equal(result.imuForecastParameters.ratePercent, 1.06);
  assert.equal(studies.toApiProperty(input, false, 0).estimatedImu, 0);
  assert.equal(studies.toApiProperty(input, false, null).imuCalculation, null);
  assert.equal(studies.toApiProperty({...input, categoria:"unknown", imuMultiplierOverride:null, estimatedImu:123}, false, 1000).estimatedImu, null);
});

test("incomplete or malformed rent never silently becomes a financial amount", () => {
  for (const value of [undefined, "", "-1", "12,", "abc", "12.3456", "1e5", "9999999999999"])
    assert.equal(presentationRent(value), null, String(value));
  for (const [value,expected] of [["1.200.000,50",1200000.5],["1200000.50",1200000.5],["1.200.000",1200000],["0",0]] as const)
    assert.equal(presentationRent(value), expected);
});
