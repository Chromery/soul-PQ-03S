# Soul Prospect Qualifier — 1.2.1

Piattaforma interna Soul per studi di fattibilità, immobili, planimetrie, stime e presentazioni.

## Funzionalità operative

- Autenticazione Clerk nominativa, ruoli amministratore/operatore e profilo aziendale.
- Sync ERP autenticato, esiti con data/ora, note immobile, archivio e audit richieste ERP per 10 giorni.
- Editor PDF, taratura per pagina/intero file, rotazioni, gruppi di valutazione, IMU attuale/prevista indipendenti.
- Presentazione V3: bozze persistenti, raggruppamenti modificabili, storico e colonne IMU opzionali.
- Documenti su storage S3/B2, normalizzazione indirizzi e riconoscimento con NeuralWatt.
- Prezzari: catalogo con fonti, proposte contestuali e conferma esplicita dell'operatore. Nessuna variazione automatica delle stime.

I limiti dell'estrazione dei prezzari sono descritti in [analisi prezzari](docs/analisi-prezzari.md). Il catalogo è online dalla 1.2.0; i prezzi proposti non sostituiscono la valutazione professionale.

## Ambienti

Seguire [AGENTS.md](AGENTS.md): worktree `staging` e `main`, progetti Compose e database distinti. Non distribuire produzione dal worktree di staging.

- Produzione: `https://pq-soul.rainailab.com`, progetto `soul-prospect-qualifier`.
- Staging: `https://st-pq-soul.rainailab.com`, progetto `soul-pq-staging`.

## Installazione e migrazione

Docker Engine con Compose v2, Git; Node 22 per gli script locali. Le immagini includono PostgreSQL client 17, Chromium, Poppler e Tesseract. Usare un clone Git indipendente sulla VPS cliente: la directory `*-main` di questo server è un worktree, non un clone trasportabile da solo.

1. Configurare `.env` dalla traccia `.env.example`; usare credenziali reali distinte per ambiente e password DB casuale. Non pubblicare il file, né copiarlo in ticket/chat.
2. Copiare `00_prezzari2026/` (esclusa da Git) e verificare tutte le fonti. Il PDF template e il catalogo derivato sono versionati.
3. Eseguire `node scripts/deployment-preflight.mjs .env`: legge la configurazione senza stampare segreti e blocca default deboli/porte pubbliche.
4. Preparare database, allegati S3, audit ERP e backup secondo la guida PDF di consegna. Un dump PostgreSQL non contiene gli allegati o gli account Clerk.
5. Solo sul nuovo ambiente vuoto, avviare PostgreSQL, ripristinare il dump e applicare `npm run db:migrate:deploy --workspace @soul/api` nel container API.
6. Avviare API/web e verificare autenticazione, ERP, documenti, editor e PDF prima del cambio traffico.

Comandi di build, dal clone/worktree corretto:

```sh
docker compose -p soul-prospect-qualifier build api web postgres-backup
docker compose -p soul-prospect-qualifier up -d postgres
# Ripristino del dump: seguire la guida, SOLO su DB di destinazione verificato.
docker compose -p soul-prospect-qualifier run --rm --no-deps api npm run db:migrate:deploy --workspace @soul/api
docker compose -p soul-prospect-qualifier up -d api web postgres-backup
```

L'avvio API applica le migrazioni ma **non esegue seed demo**. Il seed è esplicitamente vietato con `APP_ENV=production`. Non usare `down -v`, né sincronizzare a caldo la directory fisica di PostgreSQL.

## Sviluppo e test

```sh
npm ci
npm run db:generate
npm run dev:api
npm run dev
npm test
node --test scripts/deployment-preflight.test.mjs scripts/postgres-backup.test.mjs scripts/prezzari/lib.test.mjs
```

I test PDF completi richiedono `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`, Poppler e Tesseract: eseguirli nell'immagine API con sorgenti/test montati in sola lettura, senza credenziali di produzione. La suite browser `apps/web/e2e` è riservata allo staging.

L'automazione usa un'identità Clerk dedicata e, dalla 1.2.1, un secondo segreto `PQ_AUTOMATION_SECRET` (32+ caratteri) custodito nell'ambiente di test. Il solo OTP di test Clerk non consente più l'accesso alle API. La fixture browser trasmette il segreto tramite cookie HttpOnly limitato a `/api`, senza salvarne lo stato o inviarlo a servizi esterni.

## Dati e backup

- PostgreSQL 17: studi, note, geometrie, bozze, snapshot e storico presentazioni.
- S3/B2: documenti e prezzari caricati; mantenere chiavi e checksum nella migrazione.
- `00_prezzari2026/`: originali locali del motore di suggerimento, montati read-only.
- Volume `erp_audit_logs`: audit sanitizzato, massimo 10 giorni / 256 MiB.
- Volume `imu_delibere_cache`: documenti IMU locali, da copiare se presenti.
- `backups/postgres`: dump completi; i `.part` non sono backup validi.

Il worker crea un dump ogni giorno alle 03:00 Europe/Rome, verifica l'indice e lo carica nello storage remoto. Conservazione locale 14 giorni; la retention remota richiede una policy del provider. Un fallimento di dump/upload restituisce errore. Il namespace remoto staging è `staging/backups/postgres`, distinto dalla produzione.

Non cambiare `POSTGRES_PASSWORD` nel solo `.env` su un DB esistente: occorre anche ruotare la password del ruolo PostgreSQL e riallineare API/worker. Non cambiare il token ERP di produzione senza coordinare l'integratore.

## Note di sicurezza

PDF.js 3.11.174 è mantenuto per compatibilità con i disegni catastali; il caricamento disabilita `isEvalSupported`. Rimane una dipendenza obsoleta da sostituire con una migrazione testata su Chrome Windows e Safari. L'immagine API include tool di sviluppo; l'audit npm non equivale alla prova di sfruttabilità e non sostituisce un audit OS.

Consulta i due PDF di consegna in `deliverables/handover-2026-10-02/` (artefatti locali; non pubblicati nel frontend) e i sorgenti in `docs/handover/`.

Per rigenerarli in un ambiente con Chromium e le dipendenze installate: `node scripts/render-handover-pdfs.mjs`. Il renderer verifica che ogni pagina rientri nell'area stampabile A4. Il contenuto descrive la review del 2 ottobre 2026: aggiornare evidenze e data prima di usarlo per una nuova consegna.
