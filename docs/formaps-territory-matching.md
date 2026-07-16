# Matching catastale forMaps

Soul PQ conserva una fotografia delle province e dei comuni esposti dai Select2 catastali di forMaps. Il
catalogo viene generato dagli endpoint `GetProvinceCatastali` e `GetComuniCatastali` e include anche province
catastali storiche e sezioni come `CESENA/sez.A`, non soltanto gli attuali comuni amministrativi.

Il file generato contiene data, conteggi e SHA-256 della lista. Per aggiornarlo:

```bash
npm run formaps:sync
```

Il comando aggiorna anche la mappa codice → nome provincia usata dal frontend. L'istantanea del 16 luglio
2026 contiene 101 province catastali e 8.900 voci comunali.

## Ordine di risoluzione

Durante la sync ERP e l'estrazione della visura si applicano, nell'ordine:

1. confronto esatto dopo la normalizzazione di maiuscole, accenti, apostrofi e punteggiatura;
2. alias tra province amministrative recenti e province catastali forMaps, per esempio `MB → MI` e `FC → FO`;
3. similarità testuale su comune e provincia, con preferenza per un candidato nettamente distinto;
4. solo se la shortlist resta ambigua, NeuralWatt riceve al massimo otto candidati e l'evidenza testuale della
   visura; può scegliere esclusivamente uno degli ID proposti oppure restituire `null`.

Un match esatto o un fuzzy match con margine sufficiente non chiama NeuralWatt. Se una città è divisa in più
sezioni e la visura non indica la sezione, il sistema non ne inventa una.

Le variabili opzionali sono:

- `NEURALWATT_TERRITORY_MATCH_ENABLED`, `true` per default;
- `NEURALWATT_TERRITORY_MATCH_TIMEOUT_MS`, `25000` per default.

L'estensione 0.4.0 applica inoltre un ultimo fuzzy match sulla lista live di forMaps quando il valore ricevuto
non produce un match esatto. Il fallback fisso viene quindi usato soltanto se anche catalogo, shortlist e lista
live non riescono a produrre una scelta sufficientemente distinta.

## Estrazione delle nuove visure

Le nuove visure caricate manualmente o ricevute durante la sync ERP vengono elaborate automaticamente. Il
flusso prova prima `pdftotext` sul PDF originale e legge separatamente:

- comune e provincia;
- codice comune catastale;
- sezione catastale o urbana corrente;
- foglio e particella.

Le righe `Codice Comune … - Sezione …` vengono usate soltanto quando sono correlate al codice comune e al
foglio o alla particella dell'immobile principale. I riferimenti storici non correlati vengono ignorati. Se il
PDF non contiene testo nativo o resta incompleto, OpenRouter esegue il fallback sul PDF; NeuralWatt interviene
soltanto sull'eventuale shortlist territoriale ancora ambigua.

Il risultato canonico viene salvato nei campi `sezioneCatastale`, `codiceComuneCatastale` e
`formapsMunicipalityId`. Prima della scrittura il sistema confronta la visura con comune, foglio, particella e
gli identificativi già presenti: una visura associata all'immobile sbagliato fallisce senza modificare il record.

## Backfill delle visure esistenti

Il backfill è in dry-run per default e restituisce proposte, conflitti, documenti incompleti e mismatch senza
scrivere nel database:

```bash
npm run formaps:backfill-visure
```

Solo dopo aver controllato il report si applicano le proposte coerenti:

```bash
npm run formaps:backfill-visure -- --apply
```

Una visura può propagare la sezione agli altri immobili esclusivamente all'interno dello stesso studio e con
comune, foglio e particella identici. Un `formapsMunicipalityId` già presente e diverso non viene sovrascritto.
Ogni estrazione diretta applicata genera inoltre un `VisuraExtractionJob` di audit con metodo
`deterministic_pdf_text`.
