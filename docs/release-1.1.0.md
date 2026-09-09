# Release 1.1.0

## Presentazione v3

- Nella sintesi della pagina 5, “Differenza rendita catastale” mostra la variazione `rendita attribuibile − rendita attuale`, come la differenza IMU: riduzioni con segno meno e colore verde; aumenti con segno più e rosso; zero neutro.
- “Saving in 10 anni” diventa “VALORIZZAZIONE ASSET”. L'importo e il grafico mantengono il calcolo precedente (saving annuo × 10).
- Le differenze della tabella immobili e la presentazione v2 non cambiano.

## Allineamento ambienti

La release porta su main/produzione anche le funzionalità già verificate in staging:

- 1.0.8: pulsante di rotazione visibile, menu per l'intero file, protezione di tarature/aree, orientamento automatico PDF.js/OCR Tesseract.
- 1.0.9: bozze presentazioni persistenti per studio/gruppo, ripristino esplicito, tabella di generazione ordinabile per esito/colonna, storico completo e cancellazione logica, esclusione delle presentazioni eliminate dai futuri sync ERP.

Il deploy richiede la migrazione additiva `20260909160000_presentation_drafts_history` anche sul DB di produzione. Eseguire backup verificato prima della migrazione, non eseguire il seed. I database e le credenziali Clerk restano separati: l'allineamento riguarda il codice, non la copia dei dati di staging in produzione.

Gli snapshot già generati conservano i propri valori. La variazione di stile si applica anche al successivo rendering di un PDF storico, poiché l'archivio esistente conserva snapshot dei dati, non file PDF binari immutabili.
