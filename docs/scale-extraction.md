# Estrazione Scala Planimetria

La feature estrae automaticamente la scala di una planimetria PDF tramite Qwen3.6 35B Fast Vision su NeuralWatt.

Il backend renderizza ogni pagina del PDF come immagine e la analizza separatamente. Il primo passaggio
mostra al modello i margini superiore e inferiore e il cartiglio sinistro ruotato nei due versi; un
secondo passaggio controlla pagina completa e margine destro solo quando il primo non trova una scala.
In questo modo legge anche cartigli piccoli o ruotati, resta entro il limite di quattro immagini per
richiesta e mantiene una scala indipendente per ciascun foglio. Il formato fisico A3/A4 viene ricavato
direttamente dai metadati PDF, non stimato dal modello.

Nello stesso passaggio il backend analizza programmaticamente la geometria delle righe della text layer
del PDF. Se il testo principale è verticale o capovolto, salva la rotazione correttiva della singola
pagina (`90`, `180` o `270` gradi). Questa analisi non usa token AI, non modifica pagine che contengono
già aree disegnate e lascia sempre prevalere una rotazione manuale dell'operatore.

## Orientamento editor — staging 1.0.8

- All'apertura PDF.js analizza le trasformazioni del testo, includendo `/Rotate` una sola volta.
  Corregge solo direzioni nettamente prevalenti (almeno 2 frammenti, 24 caratteri, prevalenza 85%).
- Per le pagine raster non risolte viene avviato un job locale `orientation_only: true`.
  Tesseract 5, lingua italiana, legge quattro copie a 0/90/180/270° con segmentazione sparsa (`--psm 11`).
  La scelta richiede almeno 4 parole, qualità media pesata >=85/100 e vantaggio >=15 punti sulla seconda copia.
  Risultati ambigui o timeout non ruotano la pagina. Non viene usata la sola modalità OSD.
- Questo job NON chiama NeuralWatt e NON cambia scala, formato foglio, rendite o tarature.
  Qwen su NeuralWatt rimane dedicato all'estrazione della scala. Le prove vision su campioni 90/270°
  non sono risultate abbastanza affidabili per abilitarle come correzione automatica.
- Si conservano rotazioni salvate (compreso `0`), aree, lotto e tarature. I job di un altro PDF sono
  scartati confrontando SHA-256. I job in corso vengono seguiti in background fino a 10 minuti.
- Il tentativo OCR automatico viene eseguito al massimo una volta per file/immobile/browser.
  Il menu “Ruota” permette di riprovarlo. Si applica il limite PDF configurato di 24 pagine;
  i PDF oltre limite restano ruotabili manualmente. Nei gruppi è disponibile l'analisi vettoriale,
  ma il job OCR non viene lanciato sul PDF aggregato per non associarlo a un singolo immobile.
- “Ruota” applica +90° alla pagina; la freccia apre la rotazione dell'intero file e il comando -90°.
  La rotazione dell'intero file è un'unica azione annullabile: trasforma anche maschere, poligoni,
  perimetro lotto e coordinate della taratura. Non sovrascrive il PDF originale nello storage.
  Le modifiche vengono persistite con “Salva bozza”.

## Configurazione

Variabili backend:

```text
NEURALWATT_API_KEY=REPLACE_NEURALWATT_API_KEY
NEURALWATT_API_URL=https://api.neuralwatt.com/v1/chat/completions
NEURALWATT_SCALE_MODEL=qwen3.6-35b-fast
NEURALWATT_SCALE_RENDER_DPI=180
NEURALWATT_SCALE_MAX_PAGES=24
NEURALWATT_SCALE_TIMEOUT_MS=45000
```

La chiave reale va tenuta solo nei file `.env` locali ignorati da Git.

## Trigger

La job viene creata in due casi:

- quando l'ERP sincronizza un documento `planimetria` nuovo o con contenuto modificato;
- quando l'operatore carica una planimetria nell'editor o richiede esplicitamente una nuova estrazione.

La semplice apertura dell'editor recupera l'ultimo job salvato e non chiama il modello.
Dalla 1.0.8 può accodare il solo riconoscimento OCR locale dell'orientamento come descritto sopra.
La sync ERP non attende la risposta del modello: crea la job e prosegue. L'editor, invece, mostra lo stato della job e applica la scala rilevata se la confidenza e sufficiente.

## Endpoint

```text
POST /api/properties/:propertyId/scale-extraction-jobs
GET  /api/properties/:propertyId/scale-extraction-jobs
GET  /api/properties/:propertyId/scale-extraction-jobs/latest
GET  /api/properties/:propertyId/scale-extraction-jobs/:jobId
```

Payload manuale:

```json
{
  "file_name": "planimetria.pdf",
  "mime_type": "application/pdf",
  "file_base64": "JVBERi0xLjQKJ..."
}
```

Per il solo orientamento aggiungere `"orientation_only": true` e `"apply_active_scale": false`.
La risposta identifica il motore con `model: "tesseract-ocr-ita-4-orientations"`;
le rotazioni sono in `pageScales[].orientation` con `source: "ocr"`, mentre `scale` resta null.

Per test sincroni si puo usare:

```text
POST /api/properties/:propertyId/scale-extraction-jobs?wait=true
```

## Output

Risposta job:

```json
{
  "status": "SUCCEEDED",
  "scale": {
    "denominator": 500,
    "label": "1:500",
    "sheetSize": "A3"
  },
  "confidence": 0.9,
  "evidence": "SCALA 1:500"
}
```

Se il modello produce una risposta contraddittoria ma l'evidenza contiene una scala esplicita, il backend normalizza difensivamente il risultato leggendo pattern come `1:500`, `1/500` o `1 a 500`.
