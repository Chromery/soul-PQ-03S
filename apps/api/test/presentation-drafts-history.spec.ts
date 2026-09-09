import assert from "node:assert/strict";
import test from "node:test";
import { PresentationsService } from "../src/presentations/presentations.service.js";
import { mergeDraftChanges, validateDraftChanges } from "../src/presentations/presentation-draft.js";

const service = (prisma: unknown) => new PresentationsService(prisma as never, {} as never, {} as never,
  { get: (_key: string, fallback: unknown) => fallback } as never);

test("presentation drafts retain incomplete strings, reject foreign fields and reset explicitly", () => {
  const properties = new Set(["p1"]);
  assert.deepEqual(validateDraftChanges({ changes: { "p1:renditaAttuale": "", clientName: "Nome corretto" } }, properties),
    { "p1:renditaAttuale": "", clientName: "Nome corretto" });
  assert.throws(() => validateDraftChanges({ changes: { "other:indirizzo": "x" } }, properties));
  assert.throws(() => validateDraftChanges({ changes: { "p1:status": "x" } }, properties));
  assert.throws(() => validateDraftChanges({ changes: { clientName: 10 } }, properties));
  assert.throws(() => validateDraftChanges({ changes: { clientName: "x".repeat(1001) } }, properties));
  assert.deepEqual(mergeDraftChanges({ clientName: "Edited", "p1:indirizzo": "A" }, { clientName: null, "p1:renditaAttuale": "0" }),
    { "p1:indirizzo": "A", "p1:renditaAttuale": "0" });
});

test("draft patches retry conflicts without losing another tab's field and stay scoped to owner", async () => {
  let current = { revision: 1, overrides: { clientName: "Before" } as Record<string, string> };
  let writes = 0;
  const api = service({ feasibilityStudy: { findUnique: async () => ({ properties: [{ id: "p1" }] }) },
    presentationDraft: { upsert: async (args: any) => { assert.equal(args.where.id, "study:s1"); },
      findUniqueOrThrow: async () => structuredClone(current), updateMany: async (args: any) => {
        if (++writes === 1) { current = { revision: 2, overrides: { clientName: "Other tab" } }; return { count: 0 }; }
        assert.equal(args.where.revision, 2);
        current = { revision: 3, overrides: args.data.overrides }; return { count: 1 };
      } } });
  const result = await api.patchDraft({ studyId: "s1" }, { changes: { "p1:indirizzo": "Via corretta" } });
  assert.deepEqual(result, { revision: 3, overrides: { clientName: "Other tab", "p1:indirizzo": "Via corretta" } });
});

test("group draft accepts only group members and does not touch individual study drafts", async () => {
  const api = service({ studyGroup: { findUnique: async () => ({ studies: [{ properties: [{ id: "p1" }] }] }) },
    presentationDraft: { findUnique: async (args: any) => { assert.equal(args.where.id, "group:g1"); return { overrides: { clientName: "Gruppo" }, revision: 2 }; } } });
  assert.deepEqual(await api.getDraft({ studyGroupId: "g1" }), { overrides: { clientName: "Gruppo" }, revision: 2 });
  await assert.rejects(api.patchDraft({ studyGroupId: "g1" }, { changes: { "foreign:indirizzo": "No" } }));
});

test("history lists all active snapshots, including those older than twenty", async () => {
  const queries: any[] = [];
  const api = service({ presentationDeck: { findMany: async (args: any) => { queries.push(args); return []; } } });
  await api.list("s1"); await api.listStudyGroup("g1");
  assert.deepEqual(queries.map(query => query.where), [{ studyId: "s1", deletedAt: null }, { studyGroupId: "g1", deletedAt: null }]);
  assert.ok(queries.every(query => !query.take));
});

test("deletion hides a snapshot from downloads, clears cache and marks owner studies modified for ERP", async () => {
  const deck = { id: "deck", studyId: null, studyGroupId: "g1", deletedAt: null as Date | null };
  let changedOwner: unknown;
  const api = service({ presentationDeck: { findUnique: async () => deck }, $transaction: async (work: any) => work({
    presentationDeck: { update: async (args: any) => { deck.deletedAt = args.data.deletedAt; } },
    feasibilityStudy: { updateMany: async (args: any) => { changedOwner = args.where; } },
  }) });
  (api as any).pdfCache.set("deck", Buffer.from("cached"));
  assert.deepEqual(await api.remove("deck"), { deleted: true });
  assert.deepEqual(changedOwner, { studyGroupId: "g1" });
  assert.equal((api as any).pdfCache.has("deck"), false);
  await assert.rejects(api.renderPdf("deck"), /Presentazione non trovata/);
  await assert.rejects(api.renderHtml("deck"), /Presentazione non trovata/);
  await assert.rejects(api.renderV3Pdf("deck"), /Presentazione non trovata/);
});
