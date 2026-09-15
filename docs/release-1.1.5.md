# PQ 1.1.5 — raggruppamenti nella presentazione

- I gruppi immobili diventano automaticamente righe raggruppate nella tabella
  “Dati presentazione modificabili” e nel generatore, anche nei gruppi studi.
- Selezione multipla per raggruppare o sciogliere; espansione per modificare i
  singoli immobili. Le operazioni modificano solo la bozza della presentazione,
  mai i gruppi di valutazione, le aree, le stime o gli esiti dello studio.
- Gruppi salvati tramite le API bozza esistenti, chiave
  `<propertyId>:presentationGroup`: `manual:<uuid>` per gruppi scelti dall'operatore,
  stringa vuota per sciogliere esplicitamente, `null` per tornare al gruppo originale.
  ID fuori dallo studio/gruppo studi e valori non validi sono rifiutati.
- “Ripristina gruppi originali” preserva gli importi modificati; “Ripristina dati
  stima” preserva i raggruppamenti. I salvataggi continuano a essere condivisi
  tra tabella e generatore, con blocco della generazione in caso di errore.
- Nei PDF/HTML le righe sommano solo gli immobili inclusi. Foglio e particella
  comuni non vengono ripetuti, tutti i subalterni restano visibili. Società,
  indirizzi e categorie differenti sono conservati. L'IMU aggregata rimane
  sconosciuta se manca un valore, senza trasformare i dati mancanti in zero.
- Snapshot: `immobili` mantiene i singoli dati per totali e valore ottimizzazione
  (solo positivi); `tableRows` congela le righe raggruppate con `memberIds`.
  Conteggio e ID immobili restano quelli reali; lo storico non viene reinterpretato.
- Nessuna migrazione DB. Il sync ERP continua a inviare soltanto la presentazione
  V3 generata manualmente: contratto ERP/OpenAPI invariato (1.5.1).
