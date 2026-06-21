# ERP/PQ Sync API Spec

Versione proposta: `v1.1`

Questo documento definisce il contratto minimo di integrazione tra ERP Soul e Soul Prospect Qualifier (`PQ`).

PQ espone API server-to-server chiamate dall'ERP. L'autenticazione utenti interni resta separata e verra gestita con Clerk; questa integrazione usa credenziali machine-to-machine.

## Differenze Rispetto Alla v1

- `appuntamento_fissato` viene rimosso: PQ considera urgente uno studio se `data_prossimo_appuntamento` esiste ed e successiva alla data corrente.
- `responsabile_tecnico` diventa facoltativo: se assente, PQ assegna il responsabile tecnico di default configurato nel backend.
- Gli upload documento non usano piu presigned URL e conferma successiva: l'ERP invia i PDF in base64 nello stesso `POST /studi/sync`; PQ salva i file su Backblaze B2 tramite API S3-compatible.
- Non esiste push PQ verso ERP in questa fase: quando l'ERP vuole aggiornarsi, chiama un endpoint PQ di pull delle ultime modifiche.
- Gli endpoint sono ridotti a quelli strettamente necessari alla sincronizzazione.

## Convenzioni

Base path:

```text
/api/integrations/erp/v1
```

Formato:

- JSON `application/json`.
- Date in ISO 8601: `2026-06-21T09:30:00+02:00`.
- Importi e rendite accettati come stringhe decimali o numeri; raccomandato stringa, esempio `"29890.00"`.
- Booleani JSON reali: `true` e `false`.
- Campi API in italiano `snake_case`.
- `studio_erp_id` e `immobile_erp_id` sono le chiavi di upsert.

Autenticazione:

```text
Authorization: Bearer <erp_sync_token>
```

Nel backend attuale il token e obbligatorio solo se viene configurata la variabile `ERP_SYNC_TOKEN`; in sviluppo locale puo restare non configurato.

## Endpoint Necessari

### 1. Sincronizzazione studi ERP -> PQ

```text
POST /api/integrations/erp/v1/studi/sync
```

Importa o aggiorna uno o piu studi. Lo stesso payload puo essere reinviato senza creare duplicati, perche PQ fa upsert su `studio_erp_id` e `immobile_erp_id`.

Request:

```json
{
  "sync_id_erp": "ERP-SYNC-2026-06-21-0001",
  "studi": [
    {
      "studio_erp_id": "SF-47824-2026-001",
      "company_erp_id": "47824",
      "ragione_sociale": "Azienda Srl",
      "partita_iva": "IT00124252687",
      "codice_fiscale": "00124252687",
      "indirizzo_sede": {
        "via": "Via del Lavoro 1",
        "cap": "30199",
        "comune": "Bolzano",
        "provincia": "BZ",
        "regione": "Trentino-Alto Adige"
      },
      "stato_studio": "in_progress",
      "data_creazione_studio": "2026-06-10T10:15:00+02:00",
      "data_importazione_erp": "2026-06-21T09:30:00+02:00",
      "data_scadenza": "2026-07-15",
      "data_esito": null,
      "data_prossimo_appuntamento": "2026-06-25T15:00:00+02:00",
      "commerciale_assegnato": {
        "erp_user_id": "USR-104",
        "nome": "Mario Rossi",
        "email": "mario.rossi@soul.it"
      },
      "responsabile_tecnico": null,
      "note": "Cliente prioritario. Verificare immobili in categoria D prima dell'appuntamento.",
      "link_studio_erp": "https://erp.soul.example/studi/SF-47824-2026-001",
      "versione_numero": 1,
      "metriche": {
        "rendita_originale_totale": "60634.00",
        "rendita_proposta_totale": "74500.00",
        "differenza_rendita": "13866.00",
        "imu_attuale_totale": "15420.00",
        "imu_prevista_totale": "18890.00",
        "differenza_imu": "3470.00",
        "rendita_categoria_d": "60634.00"
      },
      "immobili": [
        {
          "immobile_erp_id": "162502",
          "foglio": "9",
          "particella": "804",
          "sub": "4",
          "ubicazione": "OSIMO(AN) VIA ACHILLE GRANDI n. 1 Piano T-1",
          "indirizzo_normalizzato": "Via Achille Grandi 1, 60027 Osimo AN",
          "comune": "Osimo",
          "provincia": "AN",
          "categoria": "D/8",
          "classamento": "Cat.D/8",
          "titolarita": "proprietario",
          "rendita_attuale": "29890.00",
          "rendita_proposta": "36000.00",
          "imu_attuale": "7600.00",
          "imu_prevista": "9200.00",
          "in_studio": true,
          "esito": "non_analizzato",
          "note_immobile": "Planimetria disponibile, verificare tettoie.",
          "ordine_visualizzazione": 1,
          "documenti": [
            {
              "tipo": "visura_catastale",
              "documento_erp_id": "DOC-991",
              "file_nome": "visura_162502.pdf",
              "mime_type": "application/pdf",
              "file_base64": "JVBERi0xLjQKJ...",
              "sha256": "7b1f8d1a5c8f..."
            },
            {
              "tipo": "planimetria",
              "documento_erp_id": "DOC-992",
              "file_nome": "planimetria_162502.pdf",
              "mime_type": "application/pdf",
              "file_base64": "JVBERi0xLjQKJ..."
            }
          ]
        }
      ]
    }
  ]
}
```

Response `200 OK`:

```json
{
  "sync_id_pq": "PQ-SYNC-01JY2TTN5E6A",
  "sync_id_erp": "ERP-SYNC-2026-06-21-0001",
  "stato": "completato",
  "ricevuti": 1,
  "creati": 1,
  "aggiornati": 0,
  "risultati": [
    {
      "studio_erp_id": "SF-47824-2026-001",
      "azione": "created",
      "immobili_upserted": 1,
      "documenti_salvati": 2
    }
  ]
}
```

Regole:

- `studi` contiene da 1 a 200 elementi.
- Gli immobili non presenti in un sync non vengono cancellati automaticamente.
- `responsabile_tecnico` e facoltativo; se assente PQ usa il default backend.
- `data_prossimo_appuntamento` sostituisce `appuntamento_fissato`.
- `in_studio` e il nome canonico; `in_study` e `is_study` sono tollerati solo per retrocompatibilita.
- `file_base64` puo essere una stringa base64 pura o una data URL `data:application/pdf;base64,...`.
- Se viene passato `sha256`, PQ lo verifica sul file decodificato.
- PQ salva i file nel bucket Backblaze B2 configurato e registra `storage_key`, `sha256` e dimensione.
- `storage_key` e la object key nel bucket S3/B2, non un percorso filesystem locale.

### 2. Lettura modifiche PQ da ERP

```text
GET /api/integrations/erp/v1/studi/modifiche?modificati_dopo=2026-06-21T00:00:00Z
```

L'ERP chiama questo endpoint quando l'operatore preme "sincronizza le ultime modifiche" dentro ERP. PQ restituisce gli studi modificati dopo la data indicata.

Response `200 OK`:

```json
{
  "generato_il": "2026-06-21T10:00:00.000Z",
  "modificati_dopo": "2026-06-21T00:00:00.000Z",
  "totale": 1,
  "studi": [
    {
      "studio_erp_id": "SF-47824-2026-001",
      "company_erp_id": "47824",
      "ragione_sociale": "Azienda Srl",
      "partita_iva": "IT00124252687",
      "stato_studio": "In lavorazione",
      "data_esito": null,
      "data_prossimo_appuntamento": "2026-06-25T13:00:00.000Z",
      "appuntamento_attivo": true,
      "commerciale_assegnato": "Mario Rossi",
      "responsabile_tecnico": "Responsabile tecnico Soul",
      "note": "Cliente prioritario.",
      "link_studio_erp": "https://erp.soul.example/studi/SF-47824-2026-001",
      "modificato_il": "2026-06-21T09:45:12.000Z",
      "metriche": {
        "rendita_originale_totale": "60634.00",
        "rendita_proposta_totale": "74500.00",
        "differenza_rendita": "13866.00",
        "imu_attuale_totale": "15420.00",
        "imu_prevista_totale": "18890.00",
        "differenza_imu": "3470.00",
        "rendita_categoria_d": "60634.00",
        "numero_immobili": 1,
        "numero_immobili_categoria_d": 1
      },
      "immobili": [
        {
          "immobile_erp_id": "162502",
          "foglio": "9",
          "particella": "804",
          "sub": "4",
          "ubicazione": "OSIMO(AN) VIA ACHILLE GRANDI n. 1 Piano T-1",
          "comune": "Osimo",
          "categoria": "D/8",
          "titolarita": "proprietario",
          "rendita_attuale": "29890.00",
          "rendita_proposta": "36000.00",
          "imu_attuale": "7600.00",
          "imu_prevista": "9200.00",
          "in_studio": true,
          "esito": "Non analizzato",
          "documenti": [
            {
              "tipo": "planimetria",
              "file_nome": "planimetria_162502.pdf",
              "mime_type": "application/pdf",
              "storage_key": "erp/SF-47824-2026-001/162502/planimetria/...",
              "sha256": "a723ce3a0c9d...",
              "dimensione_byte": 810240
            }
          ]
        }
      ]
    }
  ]
}
```

Se `modificati_dopo` non viene passato, PQ restituisce tutti gli studi.

## Campi Principali

Campi studio obbligatori:

- `studio_erp_id`
- `ragione_sociale`
- `partita_iva`
- `immobili`

Campi studio consigliati:

- `company_erp_id`
- `stato_studio`
- `data_creazione_studio`
- `data_importazione_erp`
- `data_scadenza`
- `data_prossimo_appuntamento`
- `commerciale_assegnato`
- `note`
- `link_studio_erp`
- `metriche`

Campi immobile obbligatori:

- `immobile_erp_id`
- `ubicazione` oppure `indirizzo_normalizzato`
- `categoria` oppure `classamento`
- `rendita_attuale`

Campi documento obbligatori quando un documento viene inviato:

- `tipo`
- `file_nome`
- `mime_type`
- `file_base64` oppure `storage_key`

## Enum

`stato_studio` accettati:

- `da_iniziare`
- `in_progress`
- `in_lavorazione`
- `in_revisione`
- `concluso`
- `archiviato`
- `annullato`

`esito` immobile accettati:

- `non_analizzato`
- `positivo`
- `negativo`
- `non_in_studio`

`tipo` documento accettati:

- `visura_catastale`
- `visura`
- `planimetria`
- `elaborato_planimetrico`
- `elaborato`

## Errori

Formato errore:

```json
{
  "statusCode": 400,
  "message": "studio_erp_id obbligatorio",
  "error": "Bad Request"
}
```

Codici principali:

| HTTP | Uso |
| --- | --- |
| `400` | Payload non valido, campi obbligatori mancanti, base64 non valido, SHA non coerente. |
| `401` | Token ERP mancante o errato, solo se `ERP_SYNC_TOKEN` e configurato. |
| `413` | Payload troppo grande. |
| `500` | Errore backend non previsto. |

## Note Implementative

- Il backend accetta payload fino a `60mb`.
- I PDF vengono salvati tramite `DocumentStorageService`, che usa Backblaze B2 via S3-compatible API.
- Configurazione richiesta: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- `S3_FORCE_PATH_STYLE` resta configurabile e di default e `true`, scelta conservativa per provider S3-compatible.
- `S3_KEY_PREFIX` permette di cambiare prefisso delle object key, default `erp`.
- Il campo `appuntamento_attivo` e sempre derivato, mai ricevuto dall'ERP.
- `responsabile_tecnico` viene salvato solo se passato; altrimenti resta quello esistente o il default configurato.

## Decisioni Ancora Aperte

- Nome definitivo del responsabile tecnico default in produzione.
- Dimensione massima realistica dei PDF inviati in base64.
- Se in futuro convenga tornare a presigned URL per file molto grandi.
- Se `elaborato_planimetrico` debba essere mostrato in UI o solo conservato per integrazione.
