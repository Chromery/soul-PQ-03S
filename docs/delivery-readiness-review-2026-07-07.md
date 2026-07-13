# PQ - Delivery Readiness Review

Data verifica: 2026-07-07  
Branch verificata: `ERP-PQ-sync`  
Versione UI corrente: `0.44.20`

## TL;DR

PQ è usabile in alpha e il flusso principale è già coperto: studi, immobili, editor planimetrie, aree, stime, prezzari, upload documenti, backup B2 e sync ERP di base.

Prima della consegna al cliente mancano soprattutto quattro cose:

1. chiudere il collaudo end-to-end ERP con payload reali, inclusi PDF grandi e batch da più immobili;
2. mettere autenticazione/autorizzazione reale sulla UI e sugli endpoint documento;
3. aggiungere diagnostica chiara per import ERP, documenti e job AI;
4. formalizzare backup/restore, gestione segreti e criteri di cancellazione/versionamento documenti.

Sul problema specifico dei PDF planimetria: con un payload conforme alla spec PQ salva correttamente planimetria e visura su B2/S3, registra `storageKey`, `sha256`, dimensione e serve i PDF sia dal dominio `iggau.com` sia da `rainailab.com`. Se l'ERP vede ancora PDF non caricati, la causa più probabile è payload non conforme o timeout/batch troppo pesante, non un errore base dello storage PQ.

## Stato Attuale

### Funzionalità presenti

- Import studi da ERP via `POST /api/integrations/erp/v1/studi/sync`.
- Upsert studi e immobili tramite `studio_erp_id` e `immobile_erp_id`.
- Upload PDF inline nel payload ERP tramite `documenti[].file_base64`.
- Salvataggio documenti su storage S3-compatible B2.
- Download documenti da PQ via:
  - `GET /api/properties/:propertyId/documents/planimetria/download`
  - `GET /api/properties/:propertyId/documents/visura/download`
- Estrazione scala AI accodata dopo upload planimetria.
- Estrazione visura AI accodata quando mancano dati catastali essenziali.
- Prezzari su B2/S3 e associazione ai territori.
- Backup PostgreSQL giornaliero con upload remoto su B2.
- Creazione studio/immobile da PQ.
- Upload planimetria da PQ con `PUT /api/properties/:propertyId/documents/planimetria`.

### Stato infrastrutturale verificato

- API locale healthy su `localhost:3001`.
- Frontend servito su `localhost:8080`.
- Dominio pubblico `https://soul-pq-alpha-2.iggau.com` operativo.
- Dominio pubblico `https://soul-pq-alpha.rainailab.com` operativo.
- Storage S3-compatible configurato.
- Ultimo backup remoto verificato dallo status API: `soul_pq-20260707T010000Z.dump`, caricato su B2.

## Test Restore Backup

Data test: 2026-07-07

### Restore del backup schedulato

Backup testato:

```text
soul_pq-20260707T010000Z.dump
```

Verifiche eseguite:

- formato dump PostgreSQL custom valido;
- download da B2 riuscito;
- confronto byte-per-byte tra copia B2 e copia locale riuscito;
- restore in database temporaneo `soul_pq_restore_test_20260707` riuscito con `pg_restore --exit-on-error`;
- database temporaneo rimosso dopo il test.

Conteggi ripristinati dal dump schedulato delle 03:00:

| Entità | Conteggio |
| --- | ---: |
| Studi | 23 |
| Immobili | 70 |
| Documenti | 75 |
| Prezzari | 115 |
| Bozze planimetria | 6 |
| Job scala | 30 |
| Job visura | 11 |
| Migrazioni Prisma | 11 |

Nota: questo backup è stato creato alle 03:00, quindi non include le modifiche fatte dopo quell'ora.

### Backup on-demand e restore dello stato corrente

Per verificare anche lo stato live corrente è stato creato un backup manuale:

```text
soul_pq-20260707T130034Z.dump
```

Verifiche eseguite:

- backup creato dal servizio `postgres-backup`;
- upload su B2 riuscito;
- download da B2 riuscito;
- confronto byte-per-byte tra copia B2 e copia locale riuscito;
- restore in database temporaneo `soul_pq_restore_test_current_20260707` riuscito con `pg_restore --exit-on-error`;
- controllo orfani su immobili, documenti, bozze e associazioni prezzari: `0`;
- database temporaneo rimosso dopo il test.

Conteggi live al momento del backup on-demand e conteggi ripristinati:

| Entità | Live | Restore |
| --- | ---: | ---: |
| Studi | 26 | 26 |
| Immobili | 92 | 92 |
| Documenti | 86 | 86 |
| Prezzari | 115 | 115 |
| Bozze planimetria | 8 | 8 |
| Job scala | 37 | 37 |
| Job visura | 14 | 14 |
| Migrazioni Prisma | 11 | 11 |

Esito: restore backup verificato correttamente anche partendo dalla copia remota B2.

## Test Sync ERP - Test-z02

### Obiettivo

Verificare se PQ riceve correttamente PDF di visura e planimetria via API sync ERP, li salva su B2/S3 e li rende disponibili in UI/API.

### File usati

Coppia reale coerente dai file di esempio:

- Planimetria: `Esempi reali con visure e planimetrie/Calcolo Rendita/MENPHIS S.P.A/DOC_1851993864 2010.pdf`
- Visura: `Esempi reali con visure e planimetrie/Calcolo Rendita/MENPHIS S.P.A/Vis. Casnate Con Bernate_part. 2010.pdf`

Dati catastali letti dalla visura:

- Comune: Casnate con Bernate
- Provincia: Como / CO
- Foglio: 4
- Particella: 2010
- Sub: 701
- Categoria: D/1
- Rendita: 38.410,00 euro

### Endpoint testati

Locale:

```text
POST http://localhost:3001/api/integrations/erp/v1/studi/sync
```

Pubblico:

```text
POST https://soul-pq-alpha.rainailab.com/api/integrations/erp/v1/studi/sync
```

### Risultato

Lo studio `Test-z02` è stato creato correttamente dal test locale:

```json
{
  "stato": "completato",
  "ricevuti": 1,
  "creati": 1,
  "aggiornati": 0,
  "risultati": [
    {
      "studio_erp_id": "Test-z02",
      "azione": "created",
      "immobili_upserted": 1,
      "documenti_salvati": 2,
      "visure_in_coda": 0,
      "visure_errori": []
    }
  ]
}
```

Lo stesso payload inviato tramite `https://soul-pq-alpha.rainailab.com` ha risposto `200` e ha aggiornato lo stesso studio:

```json
{
  "stato": "completato",
  "ricevuti": 1,
  "creati": 0,
  "aggiornati": 1,
  "risultati": [
    {
      "studio_erp_id": "Test-z02",
      "azione": "updated",
      "immobili_upserted": 1,
      "documenti_salvati": 2,
      "visure_in_coda": 0,
      "visure_errori": []
    }
  ]
}
```

### Record documento creati

Per `Test-z02-IMM-001`, PQ ha registrato:

| Tipo | File | Dimensione | SHA256 |
| --- | --- | ---: | --- |
| `PLANIMETRIA` | `DOC_1851993864 2010.pdf` | 17.913 byte | `38a7997e4ea214f059e27ce393dbc222c558313f3777e0b42c4c6aad81f350ef` |
| `VISURA` | `Vis. Casnate Con Bernate_part. 2010.pdf` | 16.628 byte | `4e3fc1c466cd04d3052e393090d9398e52fa6b1a04fb9913d637335eb2606c46` |

Storage key generate:

```text
erp/Test-z02/Test-z02-IMM-001/planimetria/38a7997e4ea2-DOC_1851993864_2010.pdf
erp/Test-z02/Test-z02-IMM-001/visura_catastale/4e3fc1c466cd-Vis._Casnate_Con_Bernate_part._2010.pdf
```

### Download verificati

Endpoint locali:

```text
GET http://localhost:3001/api/properties/Test-z02-IMM-001/documents/planimetria/download
GET http://localhost:3001/api/properties/Test-z02-IMM-001/documents/visura/download
```

Endpoint pubblici:

```text
GET https://soul-pq-alpha-2.iggau.com/api/properties/Test-z02-IMM-001/documents/planimetria/download
GET https://soul-pq-alpha-2.iggau.com/api/properties/Test-z02-IMM-001/documents/visura/download
GET https://soul-pq-alpha.rainailab.com/api/properties/Test-z02-IMM-001/documents/planimetria/download
GET https://soul-pq-alpha.rainailab.com/api/properties/Test-z02-IMM-001/documents/visura/download
```

Tutti hanno risposto `200` con `Content-Type: application/pdf` e dimensioni coerenti.

L'estrazione scala AI della planimetria è andata a buon fine:

- status: `SUCCEEDED`
- scala rilevata: `1:500`
- evidenza: dicitura `Scala 1 : 500` presente nel documento

## Diagnosi Sul Problema PDF Planimetrie ERP

Con il payload corretto PQ funziona. Le cause più probabili lato integrazione ERP sono:

1. `documenti[].file_base64` assente, vuoto o valorizzato con un URL/percorso locale invece del contenuto base64.
2. Uso di `multipart/form-data`; la sync ERP attuale accetta JSON, non multipart.
3. Tipo documento non supportato. Per planimetria oggi il valore canonico è:

```json
{ "tipo": "planimetria" }
```

Sono accettati per visura:

```json
{ "tipo": "visura" }
{ "tipo": "visura_catastale" }
```

4. `mime_type` diverso da `application/pdf`.
5. `sha256` inviato ma non coerente con il contenuto base64.
6. Payload troppo grande o batch troppo pesante, con rischio timeout Cloudflare/HTTP. Il backend ha limite JSON `60mb`.
7. ERP invia solo `storage_key` senza aver prima caricato realmente l'oggetto nello stesso bucket accessibile a PQ.
8. Token non aggiornato o header errato. Il formato deve essere:

```text
Authorization: Bearer <ERP_SYNC_TOKEN>
```

Per chiudere definitivamente la diagnosi serve un esempio reale del payload ERP che fallisce, anche con file base64 oscurati o sostituiti, mantenendo però struttura, campi documento, tipi, header e status code ricevuto.

## Cosa Manca Prima Della Consegna

### Bloccante

1. **Autenticazione UI e API documento**
   - Lo status API indica `authentication: not-configured`.
   - Prima di una consegna reale gli endpoint documento non dovrebbero essere pubblici senza auth.
   - Va deciso se usare Clerk, Cloudflare Access o un layer minimo per alpha cliente.

2. **Collaudo ERP end-to-end con payload reali**
   - Serve almeno un test concordato con ERP su:
     - uno studio piccolo;
     - uno studio con 4+ immobili;
     - PDF reali di dimensione medio/grande;
     - retry idempotente dello stesso payload;
     - payload con dati catastali mancanti per verificare job visura.
   - Va raccolto log request/response lato ERP e lato PQ.

3. **Gestione errori import documenti**
   - La response oggi dice quanti documenti sono stati salvati, ma non espone dettagli per ogni documento salvato.
   - Per supporto cliente conviene aggiungere una sezione diagnostica o un endpoint log sync con:
     - `studio_erp_id`
     - `immobile_erp_id`
     - `documento_erp_id`
     - file name
     - tipo
     - storage key
     - sha256
     - esito
     - errore leggibile

4. **Restore backup testato**
   - I backup giornalieri su B2 ci sono.
   - Prima della consegna serve fare almeno una prova di restore su DB separato e scrivere una runbook breve.

5. **Gestione segreti**
   - `.env` unico va bene per alpha, ma prima della consegna bisogna decidere:
     - dove conservare il file;
     - chi può leggerlo;
     - procedura di rotazione token ERP;
     - procedura di rotazione chiavi B2/OpenRouter/NeuralWatt.

### Importante, Ma Non Bloccante Per Alpha Controllata

1. **Versionamento documenti**
   - Oggi esiste un solo documento per `propertyId + type`.
   - Un nuovo upload sostituisce il riferimento alla planimetria/visura corrente.
   - Va bene per semplicità, ma per audit cliente potrebbe servire storico versioni documento.

2. **Semantica cancellazione immobili**
   - Gli immobili mancanti in un sync successivo non vengono cancellati automaticamente.
   - Serve una regola condivisa con ERP: cancellazione esplicita, archiviazione o sync completo che rimuove assenti.

3. **Payload grandi**
   - Base64 in JSON è semplice, ma aumenta il peso del file.
   - Per alpha va bene se si limita la dimensione batch.
   - Se ERP manda molti PDF o PDF grandi, conviene implementare upload separato o presigned URL.

4. **Alias tipo documento**
   - Per robustezza possiamo accettare alias come `planimetria_catastale`, `scheda_planimetrica`, `floor_plan`.
   - Questo ridurrebbe errori di integrazione senza complicare troppo il backend.

5. **Osservabilità job AI**
   - Scala e visura sono accodate correttamente, ma la UI dovrebbe mostrare meglio:
     - job in corso;
     - ultimo errore;
     - modello usato;
     - evidenza AI;
     - pulsante retry.

6. **Pulizia dati test/demo**
   - `Test-z02` è stato lasciato nel DB come evidenza di collaudo.
   - Prima di demo cliente va deciso se rimuoverlo o mantenerlo come studio test marcato.

7. **Documentazione utente**
   - Serve una pagina breve per operatori:
     - creazione studio;
     - caricamento immobile;
     - upload planimetria;
     - calibrazione scala;
     - smart selection;
     - modifica aree;
     - apertura prezzari;
     - export/sync verso ERP.

8. **Performance frontend**
   - Build ok, ma Vite segnala chunk grandi.
   - `pdfjs-dist` genera un warning sull'uso interno di `eval`.
   - Non è bloccante, ma va tenuto come debito tecnico.

## Checklist Di Consegna Suggerita

1. Confermare con ERP il payload esatto di sync, inclusi documenti.
2. Fare un test ERP reale con 4 immobili e PDF reali, monitorando durata e response.
3. Aggiungere log/diagnostica per documento importato.
4. Proteggere UI e document download endpoint.
5. Testare restore backup da B2.
6. Scrivere runbook operativa:
   - deploy;
   - backup;
   - restore;
   - rotazione token ERP;
   - debug sync ERP;
   - debug documenti mancanti.
7. Pulire o marcare dati test.
8. Fare un giro QA completo sul flusso:
   - import studio;
   - apertura immobile;
   - download visura/planimetria;
   - editor planimetria;
   - scala AI/manuale;
   - tabella aree;
   - lista aree in modale;
   - prezzari;
   - modifica esito e stime;
   - backup/status impostazioni.

## Decisione Pragmatica

Per una consegna alpha controllata, non serve rifare l'architettura. La strada più semplice è:

1. mantenere sync JSON con base64 per ora;
2. limitare dimensione batch e documentarla;
3. aggiungere diagnostica per documento;
4. proteggere gli endpoint;
5. fare collaudo reale con ERP e fissare gli ultimi mismatch di payload.

Il passaggio a presigned URL o upload separato ha senso solo se i payload ERP reali superano spesso i limiti o causano timeout.
