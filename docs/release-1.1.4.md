# PQ 1.1.4 — download Swagger autenticato

- Il pulsante “Scarica Swagger ERP” in `/impostazioni` rinnova il token Clerk
  prima di scaricare il file con una richiesta autenticata e un download locale.
- Il precedente link diretto all'API poteva usare un cookie di sessione scaduto,
  senza caricare Clerk per rinnovarlo, restituendo un errore JSON 401.
- Il link da condividere con gli amministratori è `/impostazioni`, non l'URL API.
  Il pulsante gestisce errori e permessi senza scaricare un JSON al posto dello YAML.
- Nessuna modifica al contratto OpenAPI 1.5.1, alle API ERP o ai permessi backend.
  Il documento resta riservato agli amministratori; nessun token viene inserito
  nell'URL o salvato nello storage del browser.
- Rilascio solo frontend: nessuna migrazione o modifica ai dati.
