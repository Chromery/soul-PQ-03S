# PQ 1.1.11 — data e ora esito

- Corretto il campo PostgreSQL `FeasibilityStudy.concludedAt`: da `DATE` a `TIMESTAMPTZ(3)`. Il codice registrava già l'istante del cambio esito, ma il database ne eliminava l'orario.
- La migrazione conserva le date storiche a mezzanotte UTC, indipendentemente dal fuso della sessione; i `null` restano `null`. Nessuna ricostruzione arbitraria degli orari precedentemente persi e nessuna modifica a `updatedAt` per forzare sync storici.
- I nuovi cambi esito conservano ore, minuti, secondi e millisecondi. La UI visualizza l'ora italiana (`Europe/Rome`, ora legale inclusa), fino ai secondi, nel dettaglio e nel riepilogo dello studio.
- Le connessioni Prisma sono esplicitamente UTC, anche con impostazioni di fuso differenti del database o dell'URL. Il test reale ha riprodotto un disallineamento del driver con sessioni non UTC, coerente con la [segnalazione Prisma sul driver PostgreSQL](https://github.com/prisma/prisma/issues/29662); la verifica ora include un'opzione di connessione deliberatamente non UTC.
- `data_esito` nel sync conserva il nome e il formato ISO 8601 UTC. Swagger 1.5.5 chiarisce precisione, offset e gestione delle date legacy. L'ERP deve conservare il datetime senza troncarlo a data.
- Cambi esito, import con timestamp esplicito, riapertura/sospensione e sync senza variazioni mantengono le regole precedenti; cambia la precisione effettivamente salvata.
- Rilascio direttamente da `main`, senza merge di `analisi-prezzari` e senza modifiche allo staging.

## Verifica

Test unitari del formato italiano estate/inverno/cambio ora, precisione al millisecondo, esportazione ERP e cambi esito. Verifica con PostgreSQL reale in database isolato (`apps/api/scripts/verify-outcome-timestamp.ts`): migrazione da DATE, conservazione legacy/null e scrittura/lettura tramite il client Prisma rigenerato, anche con timezone database diverso da UTC.

Esito: **169/169 test backend superati**, build API/web completate e verifica PostgreSQL/Prisma reale superata. Suite eseguita con dipendenze dell'immagine Docker e configurazione TypeScript del progetto, senza utilizzare le dipendenze locali obsolete del worktree. Il test browser della schermata è aggiornato per controllare anche i secondi; non viene eseguito con l'account di automazione sulla produzione.

Deploy preceduto da backup PostgreSQL; avvio senza seed dei dati demo. Gli orari storici eventualmente visibili come 01:00/02:00 non possono essere recuperati dalla vecchia colonna DATE.
