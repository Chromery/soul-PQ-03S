# Sync ERP/PQ: gap operativi e prossimi interventi

## TLDR

PQ ora puo creare uno studio manualmente e puo caricare documenti lato PQ, ma il sync ERP e ancora pensato soprattutto come import ERP -> PQ. Per avere un sync solido serve aggiungere un flusso bidirezionale: mapping stabile degli ID ERP/PQ, outbox delle modifiche generate in PQ, ack dell'ERP, sync dei documenti con metadati e regole di conflitto chiare.

## Stato attuale

- Import studi da ERP verso PQ: `POST /api/integrations/erp/v1/studi/sync`.
- Lettura modifiche PQ per ERP: `GET /api/integrations/erp/v1/studi/modifiche`.
- Caricamento planimetria da PQ: `PUT /api/properties/:propertyId/documents/planimetria`.
- Download documenti da PQ: `GET /api/properties/:propertyId/documents/:type/download`.
- Creazione studio da PQ: `POST /api/studies`.

Gli studi creati da PQ partono con ID interno `PQ-*`, `sourceSyncId = "pq-manual"` e campi ERP nulli. Gli immobili creati dentro questi studi partono con ID interno `IMM-PQ-*`. Questo permette di lavorare subito in PQ, ma non basta per riallineare automaticamente ERP e PQ.

## Gap da chiudere

1. **Mapping identita**
   - Serve una corrispondenza persistente tra `pqStudyId` e `erpStudyId`.
   - Serve lo stesso mapping per immobili e documenti: `pqPropertyId`/`erpPropertyId`, `pqDocumentId`/`erpDocumentId`.
   - Gli ID ERP devono poter arrivare dopo la creazione iniziale da PQ.

2. **Outbox modifiche PQ**
   - Le modifiche generate in PQ devono finire in una coda/outbox locale con stato `pending`, `sent`, `accepted`, `failed`.
   - La coda deve coprire almeno: creazione studio, modifica studio, creazione/modifica immobile, upload/sostituzione documento, aggiornamento lista aree/stime.

3. **Ack ERP**
   - Dopo aver ricevuto una creazione o modifica da PQ, ERP deve rispondere con un ack contenente gli ID ERP assegnati.
   - PQ deve salvare questi ID e marcare l'evento come sincronizzato.
   - Endpoint pragmatico suggerito: `POST /api/integrations/erp/v1/sync/ack`.

4. **Documenti**
   - Ogni documento deve sincronizzare tipo, nome file, MIME type, dimensione, hash `sha256`, storage key S3/B2 e data caricamento.
   - ERP deve decidere se scaricare il file da URL temporaneo PQ o se ricevere un push del binario.
   - Le sostituzioni devono essere esplicite: stesso `propertyId + type` significa nuova versione del documento, non documento aggiuntivo.

5. **Idempotenza e retry**
   - Ogni chiamata di sync deve avere una chiave idempotente stabile.
   - Un retry non deve creare duplicati di studi, immobili o documenti.
   - Gli errori temporanei devono restare in `failed/retryable` con messaggio leggibile.

6. **Conflitti**
   - Serve una regola semplice: ERP e master per anagrafiche societarie, PQ e master per analisi, stime, aree, scale e documenti caricati da PQ.
   - In caso di update concorrente si confrontano `updatedAt`, origine modifica e campo specifico.
   - I conflitti non risolti automaticamente vanno evidenziati in UI o log amministrativo.

7. **Audit e sicurezza**
   - Salvare `createdBy`, `updatedBy`, origine (`ERP` o `PQ`) e timestamp.
   - Separare token ERP attivo da eventuali token amministrativi.
   - Loggare esito import/export senza salvare token o URL firmati permanenti.

## Percorso minimo consigliato

1. Aggiungere una tabella `SyncOutbox` o equivalente con:
   - `id`
   - `entityType`
   - `entityId`
   - `action`
   - `payload`
   - `status`
   - `attempts`
   - `lastError`
   - `createdAt`
   - `updatedAt`
   - `sentAt`
   - `acceptedAt`

2. Estendere `GET /api/integrations/erp/v1/studi/modifiche` per includere anche eventi PQ-native:
   - `origine: "PQ"`
   - `azione: "create" | "update" | "document_upload"`
   - `pqStudyId`
   - `erpStudyId`
   - payload normalizzato.

3. Aggiungere un endpoint di ack ERP:
   - input: ID evento outbox, esito, ID ERP assegnati, messaggio errore opzionale.
   - output: stato evento aggiornato.

4. Aggiungere metadata sync ai documenti:
   - `source`
   - `syncStatus`
   - `lastSyncedAt`
   - `erpDocumentId`
   - `sha256`
   - `sizeBytes`

5. Aggiungere job schedulato di retry:
   - frequenza breve, ad esempio ogni 5 minuti.
   - backoff semplice.
   - alert/log quando un evento fallisce troppe volte.

## Checklist di accettazione

- Uno studio creato da PQ appare in ERP senza duplicati.
- Dopo ack ERP, PQ mostra gli ID ERP collegati o almeno li conserva in DB.
- Un upload planimetria fatto da PQ viene visto dall'ERP con metadata e file scaricabile.
- Un retry della stessa richiesta non duplica nulla.
- Un import ERP successivo non sovrascrive analisi, aree, scale o documenti generati/modificati in PQ.
- Gli errori di sync sono leggibili da log o sezione impostazioni.
