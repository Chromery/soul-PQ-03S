# PQ 1.1.3 — editor e archivio

- Corretto overflow dell'editor con ragioni sociali lunghe: colonne grid con minimo
  zero, header comprimibile e azioni che vanno a capo; toolbar adattiva al canvas.
- Indietro, Avanti e cancellazione (compreso il menu) nella sidebar sinistra sopra
  le note. Restano scorciatoie e annullamento/ripristino. Rotazione tramite due
  icone ±90°, con menu per entrambe le direzioni su tutto il PDF.
- Gli ex studi di test sono ora l'Archivio, nascosto di default. “Mostra archivio”
  include gli archiviati nella vista, contrassegnati con un badge. Selezione multipla
  con azioni Archivia e Ripristina, disponibili agli utenti PQ autorizzati.
- `POST /api/studies/archive`: `{studyIds: string[], archived: boolean}`. Da 1 a
  200 ID unici, operazione atomica; ID inesistente rifiuta l'intera richiesta.
  Richiede autenticazione Clerk, non token ERP. Restituisce ID, stato e conteggio.
- Il campo DB/API `isTest` viene conservato come flag di compatibilità (true =
  archiviato): nessuna migrazione o cancellazione. Archiviare non cambia importazione,
  esito, gruppi, stime, file o presentazioni; il sync ERP rimane indipendente.
- Solo lo studio produzione 7, su richiesta esplicita, viene ripristinato con data
  di importazione aggiornata manualmente. Il normale ripristino conserva la data.

Regressione riprodotta prima del fix: con il nome completo Angelini e viewport
1366×768, il bordo destro della griglia arrivava a x=2636, fuori schermo.
