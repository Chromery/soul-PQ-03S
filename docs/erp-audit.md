# Tracking API ERP — PQ 1.1.1

## Ambito

Richieste al percorso `/api/integrations/erp/v1`, inclusi sync, pull modifiche e download PDF.
Non vengono registrati login Clerk, cookie, header Authorization o attività ordinarie degli utenti.
Ogni risposta applicativa ERP include `X-PQ-Request-Id` (UUID generato da PQ, non fornito dal chiamante).
Il payload di risposta e le regole di autenticazione ERP restano invariati.

## Dati conservati

- ID richiesta, orari UTC, scadenza, metodo, percorso, esito autenticazione.
- Corpo JSON originale **dopo parsing e sanificazione**, salvato prima di eseguire il controller; non una copia byte-per-byte del traffico HTTP.
- Parametri query sanificati, ID sync ERP/PQ e ID studi quando disponibili.
- Codice HTTP, durata, dimensione della risposta se dichiarata e risposta JSON sanificata, inclusi gli errori applicativi.
- Dimensione e SHA-256 del body ricevuto dal parser (dopo eventuale decompressione), senza conservarne la copia grezza.
- File base64/binari/data URL omessi: restano nomi, tipo documento, MIME, chiavi di storage e altri metadati. Per contenuti stringa omessi si conservano lunghezza e hash della stringa codificata (`encodedSha256`), non il PDF.
- Password, token, cookie, secret, credenziali negli URL e firme dei link sono oscurati, anche se annidati nel JSON. Non inviare credenziali in campi di testo libero: la sanificazione non è una garanzia contro ogni possibile formato di segreto.

Per richieste non autenticate si conservano **solo metadati**, non body/query/risposta.
Per JSON malformato o payload rifiutato dal parser non si conserva il body, né il messaggio che potrebbe riportarne frammenti; restano ID richiesta, stato HTTP e metadati disponibili.
Per download PDF non si conserva il contenuto della risposta.

Stati:

- `received`: richiesta registrata ma senza chiusura osservata (es. arresto del processo).
- `completed`: risposta conclusa; controllare anche `statusCode` per distinguere successo/errore.
- `connection_closed`: connessione chiusa prima del completamento. Questo non garantisce che l'elaborazione o eventuali scritture del sync siano state annullate.

Richieste fermate da Cloudflare/nginx **prima di raggiungere Node** non compaiono qui: per quelle restano necessari i log del proxy. I log pregressi non sono ricostruibili retroattivamente.

## Retention e spazio

- Record non più consultabili dopo **10 giorni dalla ricezione**.
- Eliminazione fisica automatica all'avvio e ogni 15 minuti (quindi entro circa 10 giorni + 15 minuti mentre il servizio è operativo).
- Volume Docker dedicato `erp_audit_logs`, separato per progetto Compose: produzione e staging non condividono i log. Directory `/var/lib/soul-pq/erp-audit`, permessi 0700, file 0600.
- Il volume non è incluso nei backup automatici PostgreSQL/B2 dell'applicazione. Non copiarlo in backup a lunga conservazione senza una policy equivalente.
- Massimo 1 MiB circa per body sanificato, 2,3 MiB per record; troncamenti dichiarati con `requestTruncated`/`responseTruncated` e marcatori nel contenuto.
- Tetto 256 MiB / 10.000 record per ambiente, con riserva di almeno 256 MiB sul filesystem. I log non scaduti **non** vengono cancellati anticipatamente per fare spazio: oltre il limite, nuove scritture possono non essere registrate.
- Se la scrittura non riesce, il sync continua. Si emette l'evento tecnico `erp_audit_unavailable` (al massimo uno al minuto), si aggiornano i contatori diagnostici e, se la risposta non è ancora partita, si aggiunge `X-PQ-Audit-Status: unavailable`.
- Le scritture sono atomiche (file temporaneo + rename) e serializzate. Una chiusura improvvisa può lasciare la richiesta come `received`; il logging non è una coda transazionale del sync.

## Consultazione (solo amministratori PQ)

Le seguenti API richiedono una sessione **Clerk amministratore dell'ambiente corretto**. Il token tecnico ERP non dà accesso ai log.

```text
GET /api/system/erp-audit?study_id=78&limit=50
GET /api/system/erp-audit?sync_id=ERP-20260910084250
GET /api/system/erp-audit/:requestId
```

`study_id` e `sync_id` sono filtri facoltativi. `limit` è tra 1 e 100 (default 50).
La lista restituisce metadata senza i body, totale dei risultati e diagnostica storage (`ready`, `bytes`, `maxBytes`, `failures`, `lastFailureAt`). Il dettaglio include i body sanificati. Tutte le risposte amministrative sono `Cache-Control: no-store`.

Non è prevista in questa release una pagina UI dedicata: i log sono consultabili tramite queste API amministrative o da chi amministra il server.

## Verifiche

Test automatici: preservazione delle rendite; rimozione allegati/segreti; limite dimensione/profondità; persistenza prima del controller; sync riuscito, errore applicativo, token errato, JSON malformato, 413 del parser; esclusione dei PDF; ripresa dopo riavvio; scadenza e pulizia; guasto storage senza blocco del sync; accesso negato a utenti anonimi/operatori.
