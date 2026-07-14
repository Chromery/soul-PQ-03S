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

Il template deriva dal deck `Chromery/soul-slides`. Mantiene layout 16:9, modalità export, regole `@media print`, colori di stampa e attesa dell'elemento `#assets-ready`. Il backend apre lo stesso HTML con Chromium/Playwright e usa `page.pdf()` con `printBackground` e `preferCSSPageSize`, evitando conversioni HTML/PDF alternative.

Le immagini del template sono incorporate come data URL: pagina HTML e PDF non dipendono da CDN o asset esterni.
