import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { erpPropertyNotes, erpStudyNotes } from "../src/erp-sync/erp-sync.service.js";

test("note_studio e facoltativo e non richiede un nuovo endpoint ERP", () => {
  assert.equal(erpStudyNotes({}), undefined);
  assert.equal(erpStudyNotes({ note_studio: "Nota dello studio" }), "Nota dello studio");
});

test("il campo note precedente resta un alias retrocompatibile", () => {
  assert.equal(erpStudyNotes({ note: "Nota legacy" }), "Nota legacy");
  assert.equal(
    erpStudyNotes({ note_studio: "Nota nuova", note: "Nota legacy" }),
    "Nota nuova",
  );
});

test("note_immobile e facoltativo e viene normalizzato per il sync ERP", () => {
  assert.equal(erpPropertyNotes({}), undefined);
  assert.equal(erpPropertyNotes({ note_immobile: "  Verificare la tettoia.  " }), "Verificare la tettoia.");
  assert.throws(
    () => erpPropertyNotes({ note_immobile: "x".repeat(4001) }),
    BadRequestException,
  );
});
