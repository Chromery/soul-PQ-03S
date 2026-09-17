# PQ 1.1.10 — percentuale di riduzione per riga

- Nelle nuove presentazioni V3 la colonna si chiama `% RID.` e usa per default `(rendita attuale − rendita attribuibile) / rendita attuale`.
- Il flag **Considera % Rid. per IMU**, disponibile nell’anteprima modificabile e nella finestra di generazione, cambia solo quella riga in `(IMU attuale − IMU ottenibile) / IMU attuale`.
- Scelta persistita nella bozza, distinta per immobile/gruppo e per studio/portafoglio. Il gruppo ha una scelta autonoma, valida anche esportando un solo membro. Sciogliendolo tornano efficaci le preferenze individuali. Ripristinando le modifiche si torna al default rendita.
- Il totale portafoglio rimane la riduzione della rendita complessiva: non somma importi IMU con importi di rendita né media percentuali eterogenee. Questo comportamento è spiegato solo nell’editor.
- Nessuna annotazione aggiuntiva nel PDF. IMU mancante o denominatore nullo: `n.d.`; aumenti: percentuale negativa.
- Le nuove snapshot congelano `reductionBasis: "per-row"` e la base `rent`/`imu` di ciascuna riga. Le snapshot storiche senza marker o con marker `imu` mantengono i calcoli e le intestazioni originali. Nessuna rigenerazione o modifica automatica dello storico.
- Nessuna migrazione DB, modifica ai dati delle stime o modifica al contratto ERP: la scelta è nei JSON già esistenti della bozza/snapshot.

## Verifiche

Test su validazione e appartenenza dei flag, reset, gruppi e membri indipendenti, selezione parziale, snapshot immutabili, rendering misto rendita/IMU, totale rendita, denominatori nulli, IMU mancante e compatibilità storica. Test browser sulle viste studio e gruppo di studi con salvataggio, ricaricamento, scioglimento/raggruppamento ed esportazione parziale.

Esito: **166/166 test backend**, **6/6 test browser** (due esecuzioni da tre test), smoke PostgreSQL sul servizio reale passato. Controllo visivo della slide e della tabella; test geometrico del flag dentro la propria cella. Fixture QA temporanee eliminate, senza toccare studi del cliente.

Deploy separato dei due worktree, backup PostgreSQL e immagini rollback 1.1.9; avvio API senza seed. Nessun dato cliente modificato dal rilascio.
