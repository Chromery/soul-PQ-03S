import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculatePriceProposal, suggestPriceRules } from "../src/price-lists/price-rules.engine.js";
import { parsePriceQuery } from "../src/price-lists/price-rules.controller.js";
import type { PriceCatalog } from "../src/price-lists/price-rules.types.js";
const catalog: PriceCatalog = JSON.parse(readFileSync(new URL("../src/price-lists/data/catalog.generated.json",import.meta.url),"utf8"));
const id="bbcbedb7de8fc3a0cfb623f5c456d11069e6e8cac44bde28967bc3ff4187f81d";
const doc=catalog.documents.find(d=>d.id===id)!;
const own=catalog.rules.filter(r=>r.documentId===id);
test("Roma December 2025 keeps the historical source, economic epoch, exclusions and complete extraction",()=>{
  assert.equal(doc.pages,153); assert.equal(doc.year,2025); assert.equal(doc.epoch,"1988-1989");
  assert.equal(doc.includesCharges,false); assert.equal(doc.province,"RM");
  assert.equal(doc.processedPages,doc.candidatePages);
  assert.ok(catalog.documents.some(d=>d.file.includes("Roma-07-07-1995")));
  assert.equal(own.filter(r=>r.semanticReview==="pending").length,0);
});
test("Roma construction variants match the original table and office rates stay in square metres",()=>{
  const rows=own.filter(r=>r.page===67&&r.kind==="building");
  for(const pair of [[215,220],[160,175],[140,165],[230,240],[165,185],[150,175]]) {
    const r=rows.find(r=>r.valueMin===pair[0]&&r.valueMax===pair[1]); assert.ok(r);
    assert.equal(r.unit,"m2"); assert.equal(r.semanticReview,"supported");
  }
  const offices=own.find(r=>r.page===73&&r.valueMin===650&&r.valueMax===905)!;
  assert.ok(offices); assert.ok(offices.usageIds.includes("uffici"));
  assert.equal(offices.semanticReview,"supported");
  assert.equal(calculatePriceProposal(offices,doc,{province:"RM",usage:"uffici"}).applicable,true);
  const hotel=own.find(r=>r.page===69&&r.valueMin===29860)!;
  assert.equal(hotel.unit,"each"); assert.equal(calculatePriceProposal(hotel,doc,{}).applicable,false);
});
test("Roma land requires the exact municipality and OMI zone, never uses Q_media as a price",()=>{
  const r=own.find(r=>r.page===122&&r.zone==="B1"&&r.valueMin===138)!;
  assert.ok(r); assert.equal(r.valueMax,138); assert.equal(r.semanticReview,"supported");
  assert.equal(calculatePriceProposal(r,doc,{province:"RM",municipality:"Roma"}).applicable,false);
  assert.equal(calculatePriceProposal(r,doc,{province:"RM",municipality:"Roma",zone:"B1"}).applicable,true);
  assert.equal(calculatePriceProposal(r,doc,{province:"RM",municipality:"Roma",zone:"B2"}).applicable,false);
  const result=suggestPriceRules(catalog,{province:"RM",municipality:"Roma",usage:"lotto",documentId:id,zone:"B1",limit:100});
  assert.ok(result.items.some(row=>row.id===r.id));
  assert.ok(result.items.every(row=>!row.zone||row.zone==="B1"));
  assert.ok(own.filter(row=>row.page<62).every(row=>row.evidence==="review"));
  const urbanization=own.find(row=>row.page===73&&/urbanizzazione/i.test(row.label))!;
  assert.equal(urbanization.evidence,"review");
  assert.equal(calculatePriceProposal(urbanization,doc,{}).applicable,false);
  assert.equal(parsePriceQuery({zone:"E138"}).zone,"E138");
  assert.throws(()=>parsePriceQuery({zone:"E12345"}));
});
