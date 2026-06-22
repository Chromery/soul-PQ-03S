# Prompt Codex - Webapp di Test ERP/PQ Sync

Usa questo prompt in una nuova sessione Codex per creare una webapp molto semplice che simuli l'ERP e testi le API di sincronizzazione di Soul Prospect Qualifier.

```text
Devi creare una webapp di testing per simulare la sincronizzazione ERP -> Soul Prospect Qualifier (PQ).

Obiettivo:
costruire una webapp semplice, in italiano, che permetta di generare dati mock di studi di fattibilita, associare PDF mock di planimetrie e visure catastali, inviare il payload alle API sync di PQ, e leggere le modifiche da PQ tramite l'endpoint di pull.

Contesto API:
- Usa come fonte primaria lo Swagger/OpenAPI che troverai nel progetto, preferibilmente:
  - docs/openapi/erp-pq-sync.openapi.yaml
- Se disponibile, usa anche la collection Postman:
  - docs/postman/erp-pq-sync.postman_collection.json
- Il contratto funzionale e descritto anche in:
  - docs/erp-pq-sync-spec.md

Credenziali e configurazione:
- Non committare mai token o credenziali.
- Prevedi un file `.env.local` ignorato da Git con:
  - VITE_PQ_API_BASE_URL=http://localhost:3001/api
  - VITE_ERP_SYNC_TOKEN=<token ERP_SYNC_TOKEN>
- Se trovi una cartella con credenziali locali, per esempio `credentials/`, `secrets/` o simile, leggila solo come riferimento locale e non includere quei valori in file tracciati.
- Inserisci `.env.example` con valori placeholder.
- Tutte le chiamate agli endpoint sync devono usare:
  - Authorization: Bearer <token>
  - Content-Type: application/json

Stack richiesto:
- Vite + React + TypeScript.
- UI semplice ma ordinata, senza backend dedicato se non strettamente necessario.
- Se le chiamate browser verso PQ sono bloccate da CORS, configura un proxy Vite in `vite.config.ts`, per esempio `/api -> http://localhost:3001`.
- Usa CSS semplice oppure una piccola libreria gia presente nel progetto se esiste; non introdurre complessita inutile.

Funzionalita minime:
1. Schermata Configurazione
   - Campo API base URL.
   - Campo token ERP, con input password.
   - Pulsante "Test connessione" che chiama `GET /api/health`.
   - Indicatore dello stato API e database.

2. Generatore dati mock
   - Pulsante "Genera studio mock".
   - Crea almeno:
     - ragione_sociale
     - studio_erp_id
     - company_erp_id
     - partita_iva
     - codice_fiscale
     - indirizzo_sede
     - stato_studio
     - data_creazione_studio
     - data_importazione_erp
     - data_scadenza
     - data_prossimo_appuntamento
     - commerciale_assegnato
     - note
     - link_studio_erp
     - metriche
     - immobili
   - Ogni studio deve avere da 1 a 5 immobili.
   - Ogni immobile deve avere:
     - immobile_erp_id
     - ubicazione
     - indirizzo_normalizzato
     - foglio
     - particella
     - sub
     - categoria
     - classamento
     - titolarita
     - rendita_attuale
     - rendita_proposta
     - imu_attuale
     - imu_prevista
     - in_studio
     - esito
     - ordine_visualizzazione
     - documenti

3. PDF mock
   - Prevedi una cartella locale per file di esempio, per esempio:
     - mock-documents/planimetrie/
     - mock-documents/visure/
   - Io inseriro manualmente planimetrie e visure PDF dentro queste cartelle.
   - La webapp deve permettere anche upload manuale da UI di una visura e/o planimetria per ogni immobile.
   - Prima dell'invio, converti i PDF in base64 e inseriscili nei campi:
     - documenti[].file_base64
     - documenti[].file_nome
     - documenti[].mime_type = application/pdf
     - documenti[].tipo = visura_catastale oppure planimetria
   - Se non ci sono PDF disponibili, crea un PDF minimale fittizio in memoria solo per test.

4. Editor payload
   - Mostra il JSON finale che sara inviato a PQ.
   - Permetti di modificarlo manualmente in una textarea o editor JSON semplice.
   - Valida almeno che siano presenti `studi`, `studio_erp_id`, `ragione_sociale`, `partita_iva`, `immobili`.

5. Invio sync ERP -> PQ
   - Pulsante "Invia sync a PQ".
   - Chiama:
     - POST /api/integrations/erp/v1/studi/sync
   - Mostra:
     - status HTTP
     - risposta JSON formattata
     - creati
     - aggiornati
     - documenti_salvati
   - Gestisci chiaramente errori 400, 401, 413, 500.

6. Lettura modifiche PQ -> ERP
   - Campo `modificati_dopo`.
   - Pulsante "Leggi modifiche da PQ".
   - Chiama:
     - GET /api/integrations/erp/v1/studi/modifiche?modificati_dopo=...
   - Mostra lista studi modificati e il JSON completo.

7. Cronologia locale
   - Salva in localStorage gli ultimi invii:
     - data invio
     - studio_erp_id
     - esito
     - risposta breve
   - Pulsante per ripristinare un payload precedente.
   - Pulsante per svuotare cronologia.

8. UX
   - Interfaccia in italiano.
   - Deve essere una tool app, non una landing page.
   - Layout consigliato:
     - colonna sinistra: configurazione e generazione mock
     - area centrale: editor payload JSON
     - colonna destra: risultati, modifiche, cronologia
   - Evita card annidate e UI decorativa inutile.
   - Lo stato di errore deve essere molto leggibile.

9. Dati mock realistici
   - Genera nomi azienda italiani, partite IVA mock, indirizzi italiani, categorie catastali D/1, D/7, D/8, C/1, C/3.
   - Genera rendite e IMU coerenti.
   - Usa ID prefissati, per esempio:
     - SF-SIM-<timestamp>
     - IMM-SIM-<timestamp>-001
     - DOC-SIM-<timestamp>-001
   - Non cancellare dati reali. Se fai test automatici, usa solo ID con prefisso `SF-SIM-` o `SF-TEST-`.

10. Qualita e verifica
   - Prima di finire:
     - importa/parsa la OpenAPI se possibile oppure verifica manualmente endpoint e schema
     - esegui lint/build TypeScript
     - avvia la webapp localmente
     - testa `GET /api/health`
     - testa almeno una chiamata con token mancante o errato e verifica 401
     - se il token valido e disponibile, testa anche un sync reale con PDF mock piccolo
   - Documenta in README:
     - come configurare `.env.local`
     - dove mettere PDF mock
     - come avviare la webapp
     - quali endpoint vengono chiamati
     - come importare lo Swagger/Postman se utile

Vincoli:
- Mantieni il progetto piccolo e facile da buttare via.
- Non implementare autenticazione utente.
- Non usare Clerk.
- Non creare database.
- Non salvare token in localStorage se non strettamente necessario; preferisci tenerli in memoria o in `.env.local`.
- Non committare `.env.local`, credenziali o PDF di esempio reali.
- Se modifichi file, fai commit finale con un messaggio chiaro.
```
