# PQ 1.1.9 — descrizioni dei gruppi e riduzione IMU

- Pubblicata prima la 1.1.8 in produzione, con backup e migrazione IMU separata.
- Le descrizioni della riga unificata (società, comune, indirizzo, riferimenti
  catastali, categoria) sono ora override del gruppo, non dei suoi membri.
  Restano salvate fino al ripristino esplicito. Sciogliere il gruppo mostra di
  nuovo i dati individuali. Gli importi mantengono la ripartizione della 1.1.8.
- Normalizzazione delle categorie nei gruppi: `D8`, `d/8`, `D/8 ` diventano una
  sola `D/8`; le categorie realmente diverse non vengono eliminate.
- In esportazione, campi descrittivi dei membri lasciati vuoti recuperano prima
  il valore originale, poi quello del gruppo. Non si riscrivono le bozze, le
  anagrafiche o le stime. La validazione finanziaria resta attiva; gli errori
  indicano immobile e campi da correggere.
- Nuovi PDF V3: “Riduzione IMU %” = (IMU attuale − ottenibile) / IMU attuale.
  Totale ponderato sugli importi, non media delle percentuali. IMU mancante o
  denominatore zero: n.d.; aumento IMU: percentuale negativa.
- Lo snapshot conserva `reductionBasis: imu`; i PDF già presenti nello storico
  mantengono formule e contenuto originali. Rigenerare per ottenere il nuovo PDF.
- Override gruppo nelle bozze: `group:valuation:<id>:<campo>` oppure
  `group:manual:<id>:<campo>`, limitati ai gruppi appartenenti allo studio/portfolio.
  Nessuna nuova migrazione DB rispetto alla 1.1.8; nessun seed.

## Verifiche

- Suite backend completa: 164/164, inclusi PDF, storico e percentuali IMU.
- Browser autenticato in staging: 6/6; studio/portfolio, campi descrittivi vuoti,
  personalizzazione senza scrittura sui membri, normalizzazione categorie,
  reset, export parziale, persistenza, storico e parametri IMU indipendenti.
- PostgreSQL staging: creazione gruppo manuale, caption con controllo del
  proprietario, snapshot con dati individuali conservati, reset e storico
  immutabile. Creati ed eliminati esclusivamente record QA temporanei.
- Verifica visiva della slide: rendita invariata 14.493,33 €, IMU da 25.809,72 €
  a 9.693,86 €, riduzione 62,4%; intestazione leggibile e nessun sovrapporsi.
- Backup verificati: `soul-pq-main-before-1.1.8.dump`, poi
  `soul-pq-staging-before-1.1.9.dump` e `soul-pq-main-before-1.1.9.dump`.
  Immagini di rollback 1.1.8 conservate per entrambi gli ambienti.
