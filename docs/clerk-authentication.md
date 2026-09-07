# Accesso PQ con Clerk

## Stato della consegna

Versione **1.0.0 pubblicata su staging e produzione** il 7 settembre 2026.
Produzione usa un'istanza Clerk Production separata, chiavi live e accesso solo su invito.
Nessun accesso anonimo di emergenza: con configurazione mancante le API utente rispondono 503.

### Verifica produzione del 7 settembre 2026

- Dominio applicativo: `https://pq-soul.rainailab.com`; Clerk Frontend API:
  `https://clerk.rainailab.com`. Tutti e cinque i record DNS verificati tramite Domain Connect.
  Frontend API e portale account raggiungibili in HTTPS nel browser; il dashboard Clerk
  mostrava ancora `Issuing` per i certificati al momento della verifica.
- `.env` produzione separato fisicamente da staging (non piu un symlink), permessi 0600;
  chiavi live e sole origini produzione. Nessun account di automazione in produzione.
- Primo amministratore invitato con grant `pqInvitation` per produzione. L'accettazione
  dell'invito e il primo login umano completo restano da collaudare: non confondere questo
  invito con quello dell'istanza Development/staging.
- Schermata login italiana verificata nel browser, SDK Clerk caricato dal dominio live.
  Health 200; profilo e studi anonimi 401; API ERP senza token 401 e con token valido 200
  (verifica GET delle modifiche, senza importare dati). Token ERP di produzione invariato.
- Backup pre-deploy `pq-before-1.0.0-20260907.dump` verificato con `pg_restore --list`;
  immagini precedenti conservate con tag `rollback-pre-1.0.0-20260907`.
  Applicate le migrazioni `mark_existing_studies_as_test` e `user_welcome_preferences`:
  conservati 79 studi e 7.240 immobili; i 79 studi preesistenti sono ora di test.
- MFA **non attivata**: i metodi TOTP/backup codes nel dashboard richiedono il piano Pro.
  Nessun upgrade a pagamento effettuato. MFA non va considerata parte del collaudo completato.
  La pubblicazione non risolve automaticamente gli altri findings della review di sicurezza.

### Verifica staging del 6 settembre 2026

0.65.0 pubblicata su `https://st-pq-soul.rainailab.com`. Chiavi development configurate
nel `.env` non versionato; origine staging distinta dalla produzione. Primo amministratore
invitato con grant di ruolo all'accettazione; account automazione operatore creato.
Registrazioni limitate tramite allowlist alle email autorizzate. Al collaudo il dashboard
Clerk aveva ancora access mode pubblico (con allowlist attiva) e MFA disattivata: rimane
da impostare Restricted e abilitare TOTP, backup codes e obbligatorietà MFA nel dashboard.
Non considerare verificato il percorso MFA umano fino a questa configurazione.

108 test backend passati e 2 test end-to-end passati su Chromium con Clerk reale:
login/logout operatore, API e download anonimi rifiutati, impostazioni/backup vietati
all'operatore, benvenuto persistente anche dopo pulizia localStorage. Sync ERP con token
valido verificato 200; richieste senza token 401. Nessuna modifica in produzione.
Backup DB prima del deploy verificato con `pg_restore --list`.

## Configurazione Clerk e segreti

1. Creare l'applicazione nel workspace Clerk e usare l'istanza **Development** per staging.
2. Impostare **Restricted / invite-only**, disabilitando la registrazione pubblica.
   Configurare l'accesso email e MFA per gli account umani (obbligatorietà da verificare
   nelle impostazioni/piano Clerk prima della pubblicazione).
3. Per gli inviti usare il redirect `https://st-pq-soul.rainailab.com/sign-up`.
4. Nel `.env` ignorato da Git del solo worktree staging configurare:

```dotenv
APP_ENV=staging
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE
CLERK_SECRET_KEY=sk_test_REPLACE
CLERK_AUTHORIZED_PARTIES=https://st-pq-soul.rainailab.com
CORS_ORIGIN=https://st-pq-soul.rainailab.com
```

Non usare i placeholder come chiavi reali. `CLERK_JWT_KEY` è facoltativo (chiave
pubblica PEM dell'istanza per verifica locale senza recupero JWKS). Non salvare
`CLERK_SECRET_KEY` in variabili `VITE_*`, build args, repository o chat.
Per i test locali aggiungere esplicitamente solo le origini locali necessarie.
In Vite `VITE_API_URL` deve restare `/api`: cookie, download e SSE usano lo stesso origin.
Per sviluppo Vite esportare le variabili nel processo o usare `.env.local` nel workspace web;
Docker le riceve dal `.env` root tramite Compose.

Produzione: istanza **Production** separata, `APP_ENV=production`, chiavi `pk_live_`/
`sk_live_`, solo origin `https://pq-soul.rainailab.com`. Le chiavi test sono rifiutate
in produzione e quelle live in staging. Non copiare credenziali/sessioni fra ambienti.

## Utenti e ruoli

### Profilo aziendale (1.0.1)

La scheda operatore mostra nome e cognome, qualifica aziendale e permessi di accesso
separati. `GET /api/auth/me` mantiene `name` e `role` e aggiunge `firstName`, `lastName`
e `jobTitle` (null in assenza di qualifica). La qualifica non assegna mai permessi.
Il 7 settembre 2026 e stato inviato l'invito produzione al responsabile tecnico
con grant `operator`, non amministratore.

Per il profilo aziendale impostare nei private metadata Clerk (o nei public metadata
dell'invito, copiati all'accettazione) un oggetto separato dal grant:

```json
{"pqProfile":{"firstName":"Daniele","lastName":"Recchia","jobTitle":"Responsabile Tecnico"}}
```

Un `privateMetadata.pqProfile` esplicito prevale sul profilo pubblico dell'invito;
`null` lo rimuove. I nomi mancanti usano quelli dell'account Clerk, poi l'email.
`unsafeMetadata` non viene letto. Il grant resta in `privateMetadata.pq` oppure
`publicMetadata.pqInvitation`, con ambiente e ruolo espliciti come descritto sotto.

Invitare/creare account nominativi dal dashboard Clerk. Dopo l'accettazione assegnare
nei **Private metadata** (non Unsafe metadata) dell'utente:

```json
{"pq":{"environment":"staging","role":"admin","automation":false}}
```

`operator` consente il lavoro operativo su studi, immobili, editor, presentazioni e
documenti. `admin` aggiunge impostazioni di sistema e backup. La gestione account
avviene nel dashboard Clerk, non in un nuovo pannello PQ. Account senza assegnazione
esplicita o senza email primaria verificata ricevono 403/401 anche se autenticati.
Non esiste promozione automatica del primo utente, né abilitazione per solo dominio email.
Gli inviti creati dalla Backend API possono assegnare il ruolo all'accettazione usando
`publicMetadata.pqInvitation` con la stessa struttura di `privateMetadata.pq`.
I public metadata Clerk non sono modificabili dal client; `unsafeMetadata` viene ignorato.
Una voce `privateMetadata.pq` esplicita ha sempre precedenza, anche se `null` (revoca),
per evitare che un vecchio invito ripristini un accesso rimosso.
Per abilitare un utente esistente tramite script, esportare i segreti e poi:

```sh
APP_ENV=staging PQ_CLERK_USER_ID=user_REPLACE PQ_CLERK_ROLE=admin node apps/api/scripts/clerk-staging-users.mjs grant
```

Ruoli e stato account sono riletti da Clerk con cache massima di 15 secondi. La firma,
scadenza, issuer e authorized party sono verificati per ogni richiesta. La revoca di
una singola sessione segue la scadenza del JWT Clerk; gli stream attività si riconnettono
ogni 30 secondi attraverso il controllo di accesso. Non scrivere token nei log.

## API e benvenuto

Guard globale: ogni endpoint applicativo richiede un utente Clerk autorizzato. Uniche
eccezioni sono health e controller ERP, che verifica autonomamente il token tecnico.
Il token ERP non consente l'accesso alle API utente e una sessione Clerk non sostituisce
il token ERP. Senza `ERP_SYNC_TOKEN` il sync risponde 503; token errato/assente: 401.
Usare token ERP distinti per ambiente. Non ruotare quello di produzione senza concordarlo.

Le richieste browser usano il cookie di sessione Clerk same-origin; per modifiche
con cookie è obbligatoria un'Origin autorizzata. Nessun token in URL di download/SSE.
`GET /api/auth/me` restituisce identità, ruolo e `welcomeSeenAt`.
`POST /api/auth/welcome-seen` salva una sola volta l'avvenuta visualizzazione in
`UserPreferences`, indicizzata dall'ID Clerk. Il timestamp non viene riscritto.
Il vecchio flag localStorage non influenza più il benvenuto. Cambiare browser non lo ripropone.

## Test automatici solo staging

Account dedicato `operator` con `automation=true`, senza password condivisa. Una volta
configurate le chiavi test, esportare `E2E_CLERK_USER_EMAIL` (es.
`pq-automation+clerk_test@example.com`) e creare l'account:

```sh
APP_ENV=staging node apps/api/scripts/clerk-staging-users.mjs automation
```

Lo script è idempotente e rifiuta chiavi live. Non modifica account esistenti di altro tipo.
Clerk Testing crea una sessione reale tramite la Backend API, senza interazione MFA per
il solo test; non valida quindi il percorso MFA umano, da collaudare separatamente.
Chiave segreta e variabili test nel secret store del runner; mai in Git. Esportare anche
`CLERK_PUBLISHABLE_KEY` con lo stesso valore di `VITE_CLERK_PUBLISHABLE_KEY`.

```sh
npm run test:e2e --workspace @soul/web
```

In un runner Docker si puo impostare `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`
per usare il Chromium gia installato nell'immagine API.

La suite è vincolata al dominio staging, rifiuta chiavi live e prova login/logout,
API anonime, ruolo operatore e benvenuto persistente. Non registra trace/video o cookie
su disco. Non abilitare endpoint di bypass, neppure in staging. Verificare a parte il
login umano e MFA, gli account admin e disabilitati, download PDF, editor e flusso ERP.

## forMaps

Aggiornare/ricaricare l'estensione dal nuovo ZIP e ricaricare la scheda PQ. La richiesta
CAPTCHA viene eseguita nella scheda PQ autenticata tramite un content script isolato,
solo sullo stesso ambiente. Nessun token è trasferito a forMaps o nel frammento URL.
Tenere aperta la scheda PQ durante l'uso; senza sessione il proxy AI non è disponibile.
La compilazione e la gestione manuale restano separate dall'AI. La vecchia estensione
non può chiamare il proxy protetto: includere il suo aggiornamento nel collaudo.

## Pubblicazione e trasferimento

Prima del deploy: verificare branch staging, progetto `soul-pq-staging`, porte
8181/3002/5433; backup DB; chiavi corrette; almeno un admin; inviti e MFA configurati.
Solo dal worktree staging, con porte esplicite (il `.env` storico contiene default produzione):

```sh
DB_PORT=127.0.0.1:5433 API_PORT=127.0.0.1:3002 WEB_PORT=8181 DOCKER_CONFIG=/tmp/soul-pq-staging-docker-config /usr/bin/docker-compose -p soul-pq-staging up -d --build api web
```

La migrazione crea solo `UserPreferences`. Non modifica studi o utenti ERP.
Verificare 401 anonimo, 403 operatore su system, login admin, sync con token valido,
sessioni cross-environment rifiutate e UI su `https://st-pq-soul.rainailab.com`.
Non pubblicare l'immagine autenticata prima delle chiavi: altrimenti l'accesso resta chiuso.

La proprietà dell'app Clerk può essere trasferita al workspace aziendale mantenendo
utenti, chiavi, domini e configurazione. Consegnare anche billing, accessi amministrativi
e recupero MFA; rimuovere gli accessi personali non più necessari dopo la verifica.

Fonti ufficiali:
- https://clerk.com/docs/guides/dashboard/overview
- https://clerk.com/docs/guides/secure/restricting-access
- https://clerk.com/docs/guides/development/testing/playwright/test-helpers
- https://clerk.com/docs/guides/development/making-requests
