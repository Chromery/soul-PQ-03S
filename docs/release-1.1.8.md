# PQ 1.1.8 — staging

- Righe aggregate modificabili nel riepilogo e nel generatore della presentazione.
  Invio/uscita dal campo salva nella bozza: i testi sono applicati ai membri;
  gli importi sono ripartiti proporzionalmente ai valori del campo (in mancanza,
  alle rendite attuali; infine in parti uguali), conservando il totale al centesimo.
  Nella selezione PDF si modificano solo i membri inclusi. Le rendite modificate
  ricalcolano l'IMU corrispondente con i parametri di ciascun membro. Ripristino
  per campo disponibile; stime dell'editor inalterate. Sciogliendo il gruppo
  restano le modifiche ai membri nella bozza. Storico PDF già creati invariato.
- IMU attuale e prevista: aliquota e moltiplicatore indipendenti, inclusi reset,
  calcolo individuale/complessivo, riepiloghi, bozze presentazione e pull ERP.
  PATCH immobile: `imuRateOverride`/`imuMultiplierOverride` agiscono ora solo
  sulla prevista; `currentImuRateOverride`/`currentImuMultiplierOverride`
  sull'attuale. Null ripristina il sistema sul solo lato scelto, zero è valido
  per l'aliquota. I controlli dell'editor restano relativi alla prevista.
- Migrazione additiva `20260916180000_independent_current_imu`: copia gli override
  preesistenti sui nuovi campi prima di avviare l'API; nessun ricalcolo o seed.
- OpenAPI 1.5.4 documenta anche i nuovi parametri e dettaglio IMU attuale nel pull.
- Distribuzione solo staging; main e produzione restano alla versione precedente.

## Verifiche

- Build API/web riuscite; suite backend 160/160, poi 5/5 test ERP con una nuova
  regressione sui parametri separati (161 test distinti complessivamente).
- Browser autenticato staging: 6/6 test, inclusi studio e gruppo studi,
  ripristino, persistenza, generatore con selezione parziale, storico e IMU.
- Smoke PostgreSQL sul database staging: backfill senza differenze, scrittura e
  rilettura dei due calcoli, totali, reset e validazione. Record QA eliminati.
- Backup verificato prima della migrazione:
  `/backups/postgres/soul-pq-staging-before-1.1.8.dump`.
- API pubblica staging sana con database connesso e autenticazione Clerk attiva.
