import assert from "node:assert/strict";
import test from "node:test";
import { extractCadastralDataFromText } from "../src/visura-extraction/visura-text-extractor.js";

test("estrae la sezione catastale corrente senza confonderla con riferimenti storici", () => {
  const result = extractCadastralDataFromText(`
    Dati della richiesta Comune di VENEZIA (Codice:L736)
    Provincia di VENEZIA
    Catasto Fabbricati Foglio: 140 Particella: 776 Sub.: 126
    proveniente dal comune di Venezia sezione Mestre L736R
    Codice Comune L736 - Sezione E - Foglio 140 - Particella 776
  `);
  assert.equal(result.found, true);
  assert.equal(result.comune, "VENEZIA");
  assert.equal(result.codiceComuneCatastale, "L736");
  assert.equal(result.sezioneCatastale, "E");
  assert.equal(result.foglio, "140");
  assert.equal(result.particella, "776");
});

test("usa la sezione catastale correlata quando la sezione urbana ha un codice esteso", () => {
  const result = extractCadastralDataFromText(`
    Dati della richiesta Comune di CASNATE CON BERNATE (Codice:B977)
    Provincia di COMO
    Catasto Fabbricati Sez. Urb.: BER Foglio: 4 Particella: 2010 Sub.: 701
    Codice Comune B977 - Sezione B - Foglio 9 - Particella 2010
  `);
  assert.equal(result.found, true);
  assert.equal(result.sezioneUrbana, "BER");
  assert.equal(result.sezioneCatastale, "B");
});

test("estrae la sezione dai mappali correlati anche quando non appare nell'intestazione", () => {
  const result = extractCadastralDataFromText(`
    Dati della richiesta Comune di BOLOGNANO (Codice:A945)
    Provincia di PESCARA
    Catasto Fabbricati Foglio: 7 Particella: 187 Sub.: 23
    Codice Comune A945 - Sezione A - Foglio 7 - Particella 187
  `);
  assert.equal(result.found, true);
  assert.equal(result.sezioneCatastale, "A");
  assert.match(result.evidence ?? "", /Sezione catastale: A/);
});

test("ignora una sezione presente soltanto in un riferimento catastale non correlato", () => {
  const result = extractCadastralDataFromText(`
    Dati della richiesta Comune di VENEZIA (Codice:L736)
    Provincia di VENEZIA
    Catasto Fabbricati Foglio: 140 Particella: 776 Sub.: 126
    Situazione storica: Codice Comune L736 - Sezione R - Foglio 12 - Particella 99
  `);
  assert.equal(result.found, true);
  assert.equal(result.sezioneCatastale, null);
});
