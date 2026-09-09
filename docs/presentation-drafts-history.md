# Bozze e storico presentazioni — 1.0.9 (staging)

## Utilizzo

- La finestra di generazione ordina inizialmente gli immobili per esito: Positivo, Negativo, Sospeso, Neutro. Ogni intestazione è cliccabile; gli importi sono ordinati numericamente e quelli assenti restano in fondo. Ordinare non cambia la selezione.
- Le modifiche dell'anteprima (compreso il nome in copertina) sono salvate automaticamente nel database, anche se temporaneamente incomplete. Lo stato di salvataggio è visibile, con un pulsante per riprovare in caso di errore. Attendere “Modifiche salvate” prima di chiudere il browser; in presenza di modifiche pendenti viene richiesto di confermare l'uscita.
- La navigazione interna non elimina i salvataggi in coda. I campi modificati restano tali dopo refresh, riapertura e aggiornamenti ERP; quelli non modificati seguono la stima corrente. “Ripristina dati stima” richiede conferma e rimuove le personalizzazioni. I valori economici e le aree dell'editor non vengono cambiati.
- Studio e gruppo hanno bozze indipendenti, condivise tra gli utenti autenticati. Le patch per campo sono applicate con controllo di revisione: modifiche simultanee a campi diversi non si sovrascrivono; sullo stesso campo prevale l'ultima scrittura applicata.
- “Storico presentazioni” mostra tutte le generazioni, di tutte le versioni, con data, file, numero di immobili, download ed eliminazione. Si mostrano 20 righe alla volta, senza limitare lo storico recuperabile alle ultime 20.
- Ogni generazione conserva il proprio snapshot: modifiche e ripristini della bozza non cambiano i dati dei documenti già generati. I PDF continuano a essere renderizzati dallo snapshot al download, secondo il meccanismo esistente; non viene introdotto un archivio binario dei PDF.
- Le generazioni precedenti alla release già salvate sono incluse automaticamente nello storico. Non è possibile recuperare modifiche mai salvate e già perse prima di questa release.

## API autenticate

Per studio: `/api/studies/:studyId/presentations/draft`.
Per gruppo: `/api/study-groups/:studyGroupId/presentations/draft`.

- `GET` restituisce `{ overrides, revision }`.
- `PATCH` accetta `{ "changes": { "clientName": "Cliente", "ID_IMMOBILE:indirizzo": "Via Roma 44" } }`.
- Un valore `null` rimuove la personalizzazione del campo. I numeri sono stringhe nella bozza per conservare input intermedi; la creazione della presentazione mantiene la validazione numerica già esistente.
- I campi e l'appartenenza dell'immobile allo studio/gruppo sono validati dal server. Non sono modificabili campi dell'ERP, dell'esito o della stima attraverso queste API.

`GET /api/studies/:studyId/presentations` e la variante gruppo restituiscono tutti gli snapshot attivi.
`DELETE /api/presentations/:id` elimina logicamente una presentazione; è richiesta l'autenticazione PQ ordinaria.

## Eliminazione e sync ERP

L'eliminazione imposta `PresentationDeck.deletedAt` e invalida la cache PDF in memoria. Lo snapshot resta nel DB per eventuale recupero amministrativo, ma sparisce dalle liste e i download PQ/ERP rispondono 404. Non viene offerta una funzione di recupero nella UI.

Il sync continua a inviare esclusivamente l'ultima presentazione **v3 attiva**, generata manualmente, dello studio o del gruppo. Se l'ultima è eliminata, torna eleggibile la precedente attiva; se non ne rimangono, non viene inviata una presentazione. Gli studi coinvolti vengono marcati come aggiornati per il sync incrementale. Le copie già scaricate o trasferite all'ERP non possono essere revocate da PQ.

## Deploy

Migrazione additiva `20260909160000_presentation_drafts_history`: tabella `PresentationDraft` separata dalla stima, relazione con un solo proprietario, revisione e JSON degli override; colonna nullable `PresentationDeck.deletedAt`. Le righe preesistenti restano attive. Eseguire backup e `prisma migrate deploy` solo sul DB staging; non eseguire il seed. Produzione non inclusa in questa release.
