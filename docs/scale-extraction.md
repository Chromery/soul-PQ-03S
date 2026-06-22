# Estrazione Scala Planimetria

La feature estrae automaticamente la scala di una planimetria PDF tramite Qwen 3.5 Vision su OpenRouter.

## Configurazione

Variabili backend:

```text
OPENROUTER_API_KEY=REPLACE_OPENROUTER_API_KEY
OPENROUTER_SCALE_MODEL=qwen/qwen3.5-flash-02-23
OPENROUTER_PDF_ENGINE=mistral-ocr
OPENROUTER_SITE_URL=http://localhost:8080
OPENROUTER_APP_TITLE="Soul Prospect Qualifier"
```

La chiave reale va tenuta solo nei file `.env` locali ignorati da Git.

## Trigger

La job viene creata in due casi:

- quando l'ERP sincronizza un documento `planimetria` con `file_base64`;
- quando l'operatore apre/carica una planimetria nell'editor.

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
