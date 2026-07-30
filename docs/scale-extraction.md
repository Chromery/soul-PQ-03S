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
già aree disegnate e lascia sempre prevalere una rotazione manuale dell'operatore. Nei PDF composti
soltanto da immagini l'orientamento resta invariato.

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

La semplice apertura dell'editor recupera soltanto l'ultimo job salvato e non chiama il modello.
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
