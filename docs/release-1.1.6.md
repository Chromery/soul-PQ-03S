# PQ 1.1.6 — gruppi immobili suggeriti

- Pulsante “Gruppi suggeriti” nella lista immobili dello studio, con badge dei
  soli suggerimenti da rivedere. Finestra dedicata con schede per ogni gruppo,
  riferimenti catastali, sub, indirizzi, categorie e rendite; azioni ✓ e × con
  etichette accessibili e tooltip. Sezione separata per i rifiutati, ancora accettabili.
- Criterio confermato: stesso comune/sezione/foglio/particella, subalterni distinti.
  Non vengono proposti immobili già raggruppati, riferimenti mancanti/ambigui o
  duplicati dello stesso sub. Gli zeri iniziali non creano gruppi differenti.
- Rifiuti condivisi e persistenti in `PropertyGroupingDismissal`; nessun effetto
  su stime, note, esiti o timestamp di importazione. La firma include i membri:
  un gruppo invariato resta rifiutato dopo il sync, un gruppo con nuovi membri
  richiede una nuova revisione. Suggerimenti non più applicabili non sono mostrati.
- Accettazione transazionale con ricontrollo server della proposta e aggiornamento
  condizionale della membership; anche il raggruppamento manuale non sovrascrive
  più un gruppo creato contemporaneamente. Nessun ricalcolo automatico delle stime.
- API PQ protette da Clerk, documentate in OpenAPI 1.5.2. Contratto sync ERP invariato.
- Migrazione additiva `20260915180000_property_grouping_suggestions`: una tabella
  inizialmente vuota; nessun backfill. Applicare prima di avviare la nuova API,
  senza seed. Rollback applicativo compatibile, non occorre eliminare la tabella.
