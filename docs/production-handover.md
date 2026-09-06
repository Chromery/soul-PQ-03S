# Avvio operativo — 0.64.0

Il benvenuto compare alla prima apertura della dashboard o della lista studi e
si può riaprire con «Benvenuto in PQ». Nella 0.64.0 la chiusura è ricordata nel browser tramite
`soul-pq-welcome-v1`. Dall'integrazione Clerk 0.65.0 viene salvata nel database per
utente autenticato: vedere [configurazione autenticazione](clerk-authentication.md).
Il dialogo supporta tastiera, Escape, focus e preferenza di movimento ridotto.

`FeasibilityStudy.isTest` distingue gli studi di prova da quelli operativi ed è
restituito dall’API studi. Le liste della dashboard e dell’archivio immobili
nascondono i dati di prova all’apertura. «Mostra gli studi di test» li include
anche nei riepiloghi della sessione. Il flag non è un controllo di accesso:
i documenti e i collegamenti diretti agli studi rimangono disponibili.

La migrazione `20260906120000_mark_existing_studies_as_test` contrassegna una sola
volta tutti gli studi esistenti nel database in cui viene eseguita. Non elimina
dati. Il default per nuovi studi manuali o importati dall’ERP è `false`; un nuovo
sync di uno studio già contrassegnato conserva il flag. Il seed resta sempre di test.
Quando questa migrazione sarà pubblicata in produzione, contrassegnerà gli studi
esistenti in quel database al momento del deploy.

Il filtro è dell’interfaccia: i contratti di sync ERP non vengono modificati.
La dashboard non presenta dati dimostrativi in caso di errore API: mostra lo
stato reale di caricamento o un messaggio con l’azione «Riprova».

Deploy staging dal worktree staging con progetto `soul-pq-staging` e porte
esplicite `WEB_PORT=8181 API_PORT=127.0.0.1:3002 DB_PORT=127.0.0.1:5433`.
Il file `.env` condiviso contiene i default di produzione: non usarne le porte
per il deploy staging. Prima della migrazione conservare un backup del database.
