import test from "node:test";
import assert from "node:assert/strict";
import { romaPriceContext } from "./roma-2025.mjs";
test("Roma quote anchoring preserves a contiguous original and never changes a price", () => {
  const page = "Uffici con superficie lorda fino a\n2.000 mq                 465,00       Produttiva\na servizio di edificio industriale";
  const quote = romaPriceContext(page, 465, null);
  assert.ok(page.includes(quote));
  assert.match(quote, /465,00/);
  assert.equal(romaPriceContext(page, 450, null), null);
  assert.equal(romaPriceContext(page, 465, 470), null);
  assert.equal(romaPriceContext(page + "\nAltro edificio 465,00", 465, null), null);
});
