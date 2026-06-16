# ERP/PQ Sync API Spec

Versione proposta: `v1`

Questo documento definisce il contratto di integrazione tra ERP Soul e Soul Prospect Qualifier (`PQ`) per importare, aggiornare e restituire gli `studi_di_fattibilita`.

PQ espone API server-to-server che l'ERP puo chiamare. Clerk resta dedicato agli utenti interni PQ; l'integrazione ERP/PQ deve usare credenziali machine-to-machine separate.

## Obiettivi

- Importare in PQ uno o piu `studi_di_fattibilita` provenienti dall'ERP.
- Aggiornare in PQ uno studio gia importato quando cambiano dati ERP, appuntamenti, note, commerciale, proprieta o documenti.
- Collegare a ogni immobile i PDF necessari: `visura_catastale`, `planimetria`, eventuale `elaborato_planimetrico`.
- Rendere idempotenti gli import, cosi lo stesso payload puo essere reinviato senza duplicare record.
- Preparare il ritorno risultati verso ERP quando lo studio viene completato in PQ.

## Convenzioni

Base path consigliato:

```text
/api/integrations/erp/v1
```

Formato dati:

- JSON `application/json` per metadati e payload principali.
- Date in ISO 8601, esempio `2026-06-16T09:30:00+02:00`.
- Importi monetari e rendite come stringhe decimali, non float, esempio `"29890.00"`.
- Booleani JSON reali: `true` e `false`, non `True` o `False`.
- Nomi campo del contratto in italiano snake_case.
- Identificativi ERP sempre espliciti e stabili.

Autenticazione consigliata:

```text
Authorization: Bearer <erp_integration_token>
X-PQ-Timestamp: 2026-06-16T09:30:00Z
X-PQ-Signature: sha256=<hmac_sha256_body_with_shared_secret>
Idempotency-Key: erp-sync-2026-06-16T09:30:00Z-batch-001
```

La firma HMAC evita payload alterati in transito. `Idempotency-Key` deve essere obbligatorio per `POST` bulk e opzionale per `PATCH`.

## Modello Concettuale

Gerarchia dati:

```text
azienda/studio
  immobili
    documenti
  versioni_studio
    risultati_tecnici
```

Chiavi di upsert:

| Entita | Chiave primaria integrazione | Note |
| --- | --- | --- |
| Studio | `studio_erp_id` | Preferibile a `company_erp_id`, perche una azienda puo avere piu studi nel tempo. |
| Azienda | `company_erp_id` | Dato anagrafico, non deve identificare da solo lo studio. |
| Immobile | `immobile_erp_id` | Corrisponde all'id immobile nell'ERP o catasto gestionale. |
| Documento | `documento_erp_id` oppure `tipo` + `immobile_erp_id` | Se l'ERP non ha id documento, PQ usa un documento per tipo per immobile. |
| Versione studio | `versione_numero` | Serve per versioning tecnico dentro PQ. |

## Campi Mancanti Nel Draft Iniziale

Rispetto al draft condiviso, servono almeno questi dati:

- `studio_erp_id`: id dello studio, distinto dall'id azienda.
- `stato_studio`: `da_iniziare`, `in_progress`, `concluso`, `archiviato`, `annullato`.
- `data_creazione_studio`: quando lo studio nasce in ERP.
- `data_importazione_erp`: quando l'ERP ha scaricato/importato i dati di partenza.
- `data_scadenza`: scadenza operativa.
- `data_esito`: quando lo studio e stato concluso.
- `appuntamento_fissato`: booleano.
- `data_prossimo_appuntamento`: data/ora appuntamento cliente.
- `commerciale_assegnato`: owner commerciale.
- `responsabile_tecnico`: owner tecnico assegnato o proposto.
- `note`: note studio visibili in dashboard.
- `link_studio_erp`: URL diretto allo studio in ERP.
- `rendita_originale_totale`, `rendita_proposta_totale`, `differenza_rendita`.
- `imu_attuale_totale`, `imu_prevista_totale`, `differenza_imu`.
- `numero_immobili`, `numero_immobili_categoria_d`.
- Per ogni immobile: `titolarita`, `imu_attuale`, `imu_prevista`, `rendita_proposta`, `esito`, `note_immobile`.
- Per i PDF: `file_nome`, `mime_type`, `dimensione_byte`, `sha256`, `storage_key` o URL temporaneo.

Nel draft ci sono anche due nomi incoerenti: `in_study` e `is_study`. Il campo canonico deve essere `in_studio`.

## Payload Canonico Studio

Esempio di singolo studio dentro un import bulk:

```json
{
  "studio_erp_id": "SF-47824-2026-001",
  "company_erp_id": "47824",
  "ragione_sociale": "Azienda Srl",
  "partita_iva": "IT00124252687",
  "codice_fiscale": "00124252687",
  "pec": "azienda@pec.it",
  "email": "amministrazione@azienda.it",
  "telefono": "+390471000000",
  "indirizzo_sede": {
    "via": "Via del Lavoro 1",
    "cap": "30199",
    "comune": "Bolzano",
    "provincia": "BZ",
    "regione": "Trentino-Alto Adige",
    "nazione": "IT"
  },
  "stato_studio": "in_progress",
  "data_creazione_studio": "2026-06-10T10:15:00+02:00",
  "data_importazione_erp": "2026-06-16T09:30:00+02:00",
  "data_scadenza": "2026-07-15",
  "data_esito": null,
  "appuntamento_fissato": true,
  "data_prossimo_appuntamento": "2026-06-25T15:00:00+02:00",
  "commerciale_assegnato": {
    "erp_user_id": "USR-104",
    "nome": "Mario Rossi",
    "email": "mario.rossi@soul.it"
  },
  "responsabile_tecnico": {
    "erp_user_id": "USR-220",
    "nome": "Giulia Bianchi",
    "email": "giulia.bianchi@soul.it"
  },
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
    "numero_immobili": 2,
    "numero_immobili_categoria_d": 2,
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
          "dimensione_byte": 245120,
          "sha256": "7b1f8d1a5c8f...",
          "storage_key": "erp/47824/162502/visura_162502.pdf"
        },
        {
          "tipo": "planimetria",
          "documento_erp_id": "DOC-992",
          "file_nome": "planimetria_162502.pdf",
          "mime_type": "application/pdf",
          "dimensione_byte": 810240,
          "sha256": "a723ce3a0c9d...",
          "storage_key": "erp/47824/162502/planimetria_162502.pdf"
        }
      ]
    },
    {
      "immobile_erp_id": "162503",
      "foglio": "9",
      "particella": "804",
      "sub": "3",
      "ubicazione": "OSIMO(AN) VIA ACHILLE GRANDI n. 1 Piano T-1",
      "indirizzo_normalizzato": "Via Achille Grandi 1, 60027 Osimo AN",
      "comune": "Osimo",
      "provincia": "AN",
      "categoria": "D/8",
      "classamento": "Cat.D/8",
      "titolarita": "proprietario",
      "rendita_attuale": "30744.00",
      "rendita_proposta": null,
      "imu_attuale": "7820.00",
      "imu_prevista": null,
      "in_studio": false,
      "esito": "non_in_studio",
      "note_immobile": null,
      "ordine_visualizzazione": 2,
      "documenti": []
    }
  ]
}
```

## Endpoint PQ Esposti All'ERP

### 1. Import bulk studi

```text
POST /api/integrations/erp/v1/studi/importazioni
```

Importa o aggiorna un set di studi. Deve essere idempotente su `Idempotency-Key` e su `studio_erp_id`.

Request:

```json
{
  "sync_id_erp": "ERP-SYNC-2026-06-16-0001",
  "modalita": "upsert",
  "origine": "erp_soul",
  "inviato_da": "erp-service",
  "studi": []
}
```

Regole:

- `studi` deve contenere da 1 a 200 studi per richiesta.
- Se `modalita` e `upsert`, PQ crea lo studio se manca o aggiorna i dati ERP se esiste.
- Gli immobili assenti dal payload non vanno cancellati automaticamente. Per cancellazioni o archiviazioni usare `operazione: "rimuovi"` o `stato_immobile: "archiviato"` in un payload esplicito.
- I documenti nel payload sono metadati e riferimenti storage, non blob binari.

Response `202 Accepted`:

```json
{
  "sync_id_pq": "PQ-SYNC-01JY2TTN5E6A",
  "sync_id_erp": "ERP-SYNC-2026-06-16-0001",
  "stato": "accettato",
  "ricevuti": 12,
  "validi": 12,
  "non_validi": 0,
  "risultati": [
    {
      "studio_erp_id": "SF-47824-2026-001",
      "studio_pq_id": "pq_study_01JY2TV0MZ",
      "azione": "upserted",
      "immobili_upserted": 2,
      "documenti_registrati": 2
    }
  ]
}
```

### 2. Stato importazione

```text
GET /api/integrations/erp/v1/studi/importazioni/{sync_id_pq}
```

Permette all'ERP di verificare una importazione asincrona.

Response `200 OK`:

```json
{
  "sync_id_pq": "PQ-SYNC-01JY2TTN5E6A",
  "stato": "completato",
  "iniziato_il": "2026-06-16T09:30:02Z",
  "completato_il": "2026-06-16T09:30:07Z",
  "ricevuti": 12,
  "importati": 12,
  "errori": []
}
```

### 3. Aggiornamento parziale studio

```text
PATCH /api/integrations/erp/v1/studi/{studio_erp_id}
```

Aggiorna campi ERP senza dover reinviare tutto lo studio.

Request:

```json
{
  "stato_studio": "in_progress",
  "data_scadenza": "2026-07-20",
  "appuntamento_fissato": true,
  "data_prossimo_appuntamento": "2026-06-28T11:00:00+02:00",
  "commerciale_assegnato": {
    "erp_user_id": "USR-104",
    "nome": "Mario Rossi",
    "email": "mario.rossi@soul.it"
  },
  "responsabile_tecnico": {
    "erp_user_id": "USR-220",
    "nome": "Giulia Bianchi",
    "email": "giulia.bianchi@soul.it"
  },
  "note": "Appuntamento spostato. Priorita invariata.",
  "link_studio_erp": "https://erp.soul.example/studi/SF-47824-2026-001",
  "updated_at_erp": "2026-06-16T10:05:00+02:00"
}
```

Regole:

- Campi omessi non vengono modificati.
- Campi esplicitamente `null` cancellano il valore se il campo e nullable.
- `updated_at_erp` aiuta PQ a rifiutare update piu vecchi dell'ultimo gia applicato.

### 4. Upsert immobili di uno studio

```text
PUT /api/integrations/erp/v1/studi/{studio_erp_id}/immobili
```

Aggiorna l'elenco immobili di uno studio. Serve quando cambiano particelle, subalterni, rendite, titolarita o documenti.

Request:

```json
{
  "modalita": "merge",
  "immobili": [
    {
      "immobile_erp_id": "162502",
      "foglio": "9",
      "particella": "804",
      "sub": "4",
      "ubicazione": "OSIMO(AN) VIA ACHILLE GRANDI n. 1 Piano T-1",
      "categoria": "D/8",
      "classamento": "Cat.D/8",
      "titolarita": "proprietario",
      "rendita_attuale": "29890.00",
      "rendita_proposta": "36000.00",
      "imu_attuale": "7600.00",
      "imu_prevista": "9200.00",
      "in_studio": true,
      "ordine_visualizzazione": 1,
      "documenti": []
    }
  ]
}
```

`modalita`:

- `merge`: upsert immobili inviati, lascia invariati gli altri.
- `replace`: sostituisce l'elenco immobili dello studio, archiviando quelli non presenti.

### 5. Richiesta upload documenti

```text
POST /api/integrations/erp/v1/immobili/{immobile_erp_id}/documenti/upload-url
```

Endpoint consigliato per evitare PDF base64 dentro JSON. PQ restituisce URL presigned verso lo storage S3-compatible.

Request:

```json
{
  "tipo": "planimetria",
  "file_nome": "planimetria_162502.pdf",
  "mime_type": "application/pdf",
  "dimensione_byte": 810240,
  "sha256": "a723ce3a0c9d..."
}
```

Response `200 OK`:

```json
{
  "documento_pq_id": "doc_01JY2W0M1S",
  "storage_key": "erp/47824/162502/planimetria_162502.pdf",
  "upload_url": "https://storage.example/bucket/erp/47824/162502/planimetria_162502.pdf?X-Amz-Signature=...",
  "metodo": "PUT",
  "headers_richiesti": {
    "Content-Type": "application/pdf"
  },
  "scade_il": "2026-06-16T10:00:00Z"
}
```

### 6. Conferma upload documento

```text
POST /api/integrations/erp/v1/documenti/{documento_pq_id}/conferma-upload
```

Conferma che ERP ha caricato il PDF sullo storage.

Request:

```json
{
  "sha256": "a723ce3a0c9d...",
  "dimensione_byte": 810240,
  "caricato_il": "2026-06-16T09:36:00Z"
}
```

Response `200 OK`:

```json
{
  "documento_pq_id": "doc_01JY2W0M1S",
  "stato": "disponibile"
}
```

### 7. Consultazione studio importato

```text
GET /api/integrations/erp/v1/studi/{studio_erp_id}
```

Restituisce lo stato PQ dello studio, utile per debug ERP o riconciliazione.

Response `200 OK`:

```json
{
  "studio_erp_id": "SF-47824-2026-001",
  "studio_pq_id": "pq_study_01JY2TV0MZ",
  "stato_studio": "in_progress",
  "stato_pq": "analisi_in_corso",
  "versione_corrente": 1,
  "immobili": [
    {
      "immobile_erp_id": "162502",
      "stato_pq": "bozza_planimetria",
      "documenti": [
        {
          "tipo": "planimetria",
          "stato": "disponibile"
        }
      ]
    }
  ]
}
```

### 8. Risultati studio per ERP

```text
GET /api/integrations/erp/v1/studi/{studio_erp_id}/risultati
```

Consente all'ERP di leggere i risultati pronti in PQ. Questo endpoint copre il caso in cui l'ERP preferisca fare pull invece di ricevere una chiamata push da PQ.

Response `200 OK`:

```json
{
  "studio_erp_id": "SF-47824-2026-001",
  "studio_pq_id": "pq_study_01JY2TV0MZ",
  "versione_numero": 1,
  "stato_risultati": "pronto_per_erp",
  "data_esito": "2026-06-20T17:40:00+02:00",
  "esito_studio": "favorevole",
  "rendita_originale_totale": "60634.00",
  "rendita_proposta_totale": "74500.00",
  "differenza_rendita": "13866.00",
  "imu_attuale_totale": "15420.00",
  "imu_prevista_totale": "18890.00",
  "differenza_imu": "3470.00",
  "note_tecniche": "Rideterminazione sostenibile sugli immobili in categoria D.",
  "immobili": [
    {
      "immobile_erp_id": "162502",
      "esito": "positivo",
      "rendita_attuale": "29890.00",
      "rendita_proposta": "36000.00",
      "imu_attuale": "7600.00",
      "imu_prevista": "9200.00",
      "aree": [
        {
          "destinazione_uso": "capannone",
          "mq": "980.50",
          "valore": "3.40",
          "stima": "3333.70"
        }
      ]
    }
  ],
  "presentazione": {
    "stato": "disponibile",
    "file_nome": "Azienda_Srl_studio_fattibilita.pptx",
    "download_url": "https://pq.example/api/files/presentazioni/presigned/..."
  }
}
```

## Integrazione Push Verso ERP

Il pulsante PQ `Invia a ERP` richiede un canale outbound da PQ verso ERP. Sono possibili due strategie:

1. ERP fa pull periodico da `GET /risultati`.
2. ERP espone un endpoint e PQ invia i risultati quando l'operatore preme `Invia a ERP`.

Strategia consigliata per l'azione manuale:

```text
POST <ERP_BASE_URL>/api/pq/v1/studi/{studio_erp_id}/risultati
```

Il payload deve essere lo stesso di `GET /risultati`, con in piu:

```json
{
  "invio_pq_id": "PQ-SEND-01JY2X1R8M",
  "inviato_da": {
    "pq_user_id": "user_123",
    "nome": "Operatore Soul"
  },
  "inviato_il": "2026-06-20T17:45:00+02:00"
}
```

ERP deve rispondere con l'id ricezione:

```json
{
  "ricezione_erp_id": "ERP-RCV-2026-00091",
  "stato": "ricevuto"
}
```

PQ deve salvare `ricezione_erp_id`, timestamp e stato ultimo invio.

## Stati Ed Enum

`stato_studio`:

- `da_iniziare`
- `in_progress`
- `concluso`
- `archiviato`
- `annullato`

`esito` immobile:

- `non_analizzato`
- `positivo`
- `negativo`
- `non_in_studio`

`tipo` documento:

- `visura_catastale`
- `planimetria`
- `elaborato_planimetrico`
- `presentazione`
- `altro`

`titolarita`:

- `proprietario`
- `superficiario`
- `usufruttuario`
- `locatario`
- `altro`

`destinazione_uso`:

- `capannone`
- `uffici`
- `tettoie`
- `sistemazione_esterna`
- `verde`
- `lotto`

## Validazione Ed Errori

Error response standard:

```json
{
  "errore": {
    "codice": "VALIDATION_ERROR",
    "messaggio": "Payload non valido",
    "dettagli": [
      {
        "path": "studi[0].immobili[1].rendita_attuale",
        "messaggio": "Campo obbligatorio"
      }
    ]
  }
}
```

Codici:

| HTTP | Codice | Uso |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Payload formalmente errato. |
| `401` | `UNAUTHORIZED` | Token assente o non valido. |
| `403` | `SIGNATURE_INVALID` | Firma HMAC non valida. |
| `404` | `NOT_FOUND` | Studio, immobile o documento non trovato. |
| `409` | `VERSION_CONFLICT` | `updated_at_erp` piu vecchio o conflitto versione. |
| `413` | `PAYLOAD_TOO_LARGE` | Payload troppo grande, usare upload documenti separato. |
| `422` | `BUSINESS_RULE_ERROR` | Dati formalmente validi ma incoerenti. |
| `429` | `RATE_LIMITED` | Troppe richieste. |
| `500` | `INTERNAL_ERROR` | Errore PQ non previsto. |

## Regole Di Persistenza PQ

- `studio_erp_id` deve essere salvato come chiave esterna stabile.
- `company_erp_id` deve restare disponibile per raggruppamenti azienda.
- Ogni import deve salvare `data_importazione_pq` e, se presente, `data_importazione_erp`.
- PQ non deve perdere note operative inserite dentro PQ se ERP reinvia un campo `note` vecchio. Serve distinguere `note_erp` da `note_pq` oppure mantenere audit dei cambi.
- Per documenti con stesso `tipo` e stesso `immobile_erp_id`, un nuovo `sha256` crea una nuova versione documento o aggiorna il documento attivo mantenendo storico.
- Gli immobili `in_studio: false` vanno mostrati come contesto, ma non necessariamente inclusi nei calcoli tecnici.
- `rendita_proposta` e `imu_prevista` possono essere `null` in import iniziale e valorizzati da PQ dopo l'analisi.

## Mapping Indicativo Verso Prisma

| Campo API | Campo Prisma attuale/proposto |
| --- | --- |
| `studio_erp_id` | `FeasibilityStudy.id` o nuovo `erpStudyId` |
| `ragione_sociale` | `FeasibilityStudy.company` |
| `partita_iva` | `FeasibilityStudy.vat` |
| `stato_studio` | `FeasibilityStudy.status` |
| `data_creazione_studio` | `FeasibilityStudy.createdAt` |
| `data_esito` | `FeasibilityStudy.concludedAt` |
| `data_scadenza` | `FeasibilityStudy.deadline` |
| `data_prossimo_appuntamento` | `FeasibilityStudy.nextAppointment` |
| `commerciale_assegnato.nome` | `FeasibilityStudy.commercialOwner` |
| `responsabile_tecnico.nome` | `FeasibilityStudy.technicalOwner` |
| `note` | `FeasibilityStudy.notes`, meglio separare `notesErp` e `notesPq` |
| `link_studio_erp` | `FeasibilityStudy.erpUrl` |
| `immobile_erp_id` | `Property.id` o nuovo `erpPropertyId` |
| `ubicazione` | `Property.ubicazione` |
| `foglio` | `Property.foglio` |
| `particella` | `Property.particella` |
| `sub` | `Property.subalterno` |
| `categoria` | `Property.categoria` |
| `titolarita` | `Property.titolarita` |
| `rendita_attuale` | `Property.currentRendita` |
| `rendita_proposta` | `Property.estimatedRendita` |
| `imu_attuale` | `Property.currentImu` |
| `imu_prevista` | `Property.estimatedImu` |
| `in_studio` | `Property.hasStudy` |
| `documenti[].storage_key` | `PropertyDocument.storageKey` |

## Decisioni Aperte

- Confermare se l'ERP dispone di un id specifico per lo studio (`studio_erp_id`) o solo di `company_erp_id`.
- Confermare se i PDF possono essere caricati su URL presigned o se l'ERP richiede invio multipart/base64.
- Confermare quale sistema e sorgente autorevole per `commerciale_assegnato`, `responsabile_tecnico`, `note` e `stato_studio` quando modificati sia in ERP sia in PQ.
- Confermare se `elaborato_file` del draft corrisponde sempre a `planimetria` o se va distinto come `elaborato_planimetrico`.
- Confermare endpoint ERP per il push dei risultati da PQ, oppure scegliere polling ERP da `GET /risultati`.
- Definire dimensione massima batch e rate limit accettabili dall'ERP.

