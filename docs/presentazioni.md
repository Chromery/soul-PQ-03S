# Presentazioni cliente

La funzione **Genera presentazione** crea una versione immutabile della proposta per uno studio di fattibilità.

## Flusso operatore

1. Aprire uno studio e scegliere **Genera presentazione**.
2. Selezionare gli immobili nella modale. Quando esistono immobili con esito positivo, questi vengono preselezionati.
3. Generare la versione.
4. Aprire il deck HTML, copiare il link oppure scaricare il PDF.

Gli immobili con rendita proposta o valori IMU mancanti sono segnalati nella modale ma possono essere inclusi. Nel deck i valori non disponibili sono mostrati come `n.d.` e i totali IMU indicano quando sono parziali.

## Persistenza

Ogni generazione salva in `PresentationDeck`:

- lo studio e i valori cliente rilevanti;
- l'elenco ordinato degli immobili selezionati;
- rendite e IMU effettive mostrate dall'app al momento della generazione;
- data di generazione e nome del file.

Il contenuto è uno snapshot: modifiche successive allo studio non cambiano una proposta già condivisa. Una nuova generazione crea una nuova versione e non sovrascrive le precedenti.

## Endpoint

- `GET /api/studies/:studyId/presentations`: ultime versioni dello studio;
- `POST /api/studies/:studyId/presentations`: crea uno snapshot con `propertyIds`;
- `GET /api/presentations/:id`: deck HTML interattivo;
- `GET /api/presentations/:id/pdf`: PDF scaricabile.

## Rendering PDF

Il template e il renderer derivano dal deck `Chromery/soul-slides` al commit `a8201f2`. L'export è ibrido e mantiene viewport `1600x900`:

- pagine 1, 2 e 6: PDF nativo Chromium, per testo e grafica vettoriali;
- pagine 3 e 4: JPEG a DPR 2 e qualità 93, per conservare fedelmente proporzioni e margini del layout web;
- pagina 5: PNG a DPR 2, per massimizzare la leggibilità di tabelle, cifre e grafico.

Le pagine vengono ricomposte con `pdf-lib` mantenendo il formato 16:9. Ogni acquisizione usa `?export=1`, attende l'elemento `#assets-ready` e altri due frame di rendering. La risoluzione cresce tramite `deviceScaleFactor`, senza cambiare la viewport e quindi senza alterare i valori CSS `clamp()`.

Le immagini e il font variabile Inter del template sono incorporati come data URL: pagina HTML e PDF usano gli stessi asset e non dipendono da CDN o font installati sul dispositivo.
