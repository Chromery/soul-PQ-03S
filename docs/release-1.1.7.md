# PQ 1.1.7 — presentazioni V3 e composizione dei gruppi

- Solo “Generazione Presentazione” (V3) e “Storico presentazioni” filtrato alle V3,
  anche nel riepilogo rapido e nei gruppi studi. V1/V2 esistenti non cancellate;
  API legacy compatibili.
- Suggerimenti più ampi: selezione per immobile, esito, presenza di elaborato,
  visura ed elenco subalterni, titolarità, rendite e note. Si può accettare un
  sottoinsieme di almeno due membri; gli esclusi rimangono indipendenti.
- Selezionare un gruppo completo e immobili indipendenti per unirli; espandere
  il gruppo per rimuovere singoli membri. Non si fondono gruppi distinti o
  selezioni parziali di altri gruppi. Con una sola unità residua il gruppo si scioglie.
- Composizione transazionale con nuovo ID gruppo: bozze locali/editor già aperti
  non possono salvare sul nuovo insieme di pagine. Nessun immobile viene eliminato.
- Se esiste una valutazione complessiva, serve conferma: vengono ripristinati i
  valori individuali pre-gruppo e il nuovo gruppo va rivalutato. Bozza completa e
  membri precedenti sono conservati in `PropertyValuationGroupRevision`, copia
  tecnica recuperabile dal DB (non è uno storico UI; non duplica i binari PDF).
- Migrazione additiva `20260916090000_valuation_group_revisions`, prima dell'avvio
  e senza seed. Backup separati per ambiente. OpenAPI 1.5.3.
