# PQ 1.1.12 — colonne IMU opzionali in presentazione

- Nei dati modificabili e nella finestra Generazione Presentazione, la nuova opzione «Mostra IMU attuale e IMU prevista nel PDF» aggiunge entrambe le colonne dopo R.C. attribuibile. È disattivata per impostazione predefinita.
- L'opzione viene salvata nella bozza dello studio o del gruppo di studi e congelata in ogni nuova presentazione V3. Nessuna modifica retroattiva allo storico, alle V1/V2 o ai calcoli di rendita, IMU e % RID.
- Importi ricavati dai dati modificabili, con aggregazione dei membri selezionati per i gruppi e totali senza doppio conteggio. I valori mancanti compaiono come `n.d.` e non concorrono ai totali; una colonna interamente sconosciuta mantiene `n.d.`, mentre zero resta un importo valido.
- Impaginazione dedicata a dodici colonne, cifre Roboto senza ritorni a capo e adattamento delle tabelle dense allo spazio disponibile sulla slide.
- Nessuna migrazione database. Rilascio solo da main, senza includere analisi-prezzari né modificare lo staging.

Verifiche: validazione delle opzioni, default e compatibilità storica, snapshot studio/gruppo, aggregazione, valori mancanti/zero, sei pagine PDF e prove visuali con nomi lunghi/importi elevati. Test browser del flusso salvato aggiornato (richiede credenziali di staging; non eseguito in produzione).

Esito: **171/171 test backend superati**, senza test saltati; build API e web completate. Backup PostgreSQL preventivo e avvio di produzione senza seed dei dati demo.
