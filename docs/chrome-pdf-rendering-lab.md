# Chrome PDF Rendering Lab

Branch sperimentale: `test/chrome-pdf-rendering`.

Il laboratorio confronta sei strategie di rendering usando esclusivamente la
planimetria dello studio `961`, immobile `320129`. La sorgente viene letta in
tempo reale dall'endpoint di produzione tramite un proxy same-origin dedicato;
il PDF non viene copiato nel repository.

## Pagine

- `/render-lab/baseline`: A, comportamento corrente con canvas fisso x2.
- `/render-lab/native`: B, rendering adattivo al DPR nativo.
- `/render-lab/adaptive-15`: C, DPR adattivo con oversampling x1,5.
- `/render-lab/adaptive-20`: D, DPR adattivo con oversampling x2.
- `/render-lab/contrast`: E, variante C con contrasto CSS leggero.
- `/render-lab/ink-boost`: F, variante C con rinforzo di un pixel dei tratti scuri.

L'indice `/render-lab` riporta le istruzioni per il confronto. Ogni pagina
mostra browser, DPR, viewport, zoom, dimensioni del canvas, rapporto di
riduzione fisica, memoria grezza stimata e tempo di rendering.

## Protocollo di prova

1. Usare il PC Windows sul quale si manifesta il problema e Chrome al 100%.
2. Mantenere invariata la dimensione della finestra passando da A a F.
3. Confrontare la modalità `Adatta pagina` e alcuni livelli manuali di zoom.
4. Valutare visibilità dei muri, leggibilità di quote e testi e fluidità.
5. Restituire il codice preferito e, se possibile, una seconda scelta.

Il laboratorio è un ambiente isolato e non sostituisce il rendering di staging
o produzione fino alla scelta finale.
