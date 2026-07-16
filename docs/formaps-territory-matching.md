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
