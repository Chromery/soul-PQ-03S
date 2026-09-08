# Copertina dinamica PDF v3 — 1.0.5

Il nome cliente in prima pagina è letto da `snapshot.studio.company`, quindi rispetta
il nome modificato nella creazione della presentazione e il nome del gruppo studi.
La fotografia, i titoli, il logo e gli elementi grafici restano quelli del PDF originale.

Il generatore rimuove esclusivamente l'oggetto di testo del nome azienda nel template
e aggiunge testo PDF vettoriale Raleway Bold bianco, alla posizione originale. Il nome
non viene coperto con un rettangolo e lo sfondo non viene rasterizzato. Il corpo parte
da 19 pt e si riduce solo quando serve a rispettare i margini laterali. Spazi e ritorni
a capo sono normalizzati: un'unica riga, senza ellissi né tagli. Nomi estremamente lunghi
comportano inevitabilmente un carattere molto piccolo (limite API: 240 caratteri).

La sostituzione verifica posizione e contenuto dell'oggetto sorgente. Se il template
viene cambiato, un errore esplicito impedisce di distribuire accidentalmente il nome
dimostrativo. Il nome cliente viene inserito come testo, mai interpretato come HTML.

Le pagine successive seguono il comportamento precedente: pagina 5 dinamica con gli
immobili selezionati, tutte le altre copiate dal template. Nessuna modifica al DB,
alle API ERP o agli snapshot delle presentazioni. Dopo il riavvio del generatore,
anche riscaricando una presentazione v3 preesistente si ottiene la copertina corretta;
i PDF già scaricati sul PC devono essere scaricati nuovamente.

## Verifiche

`apps/api/test/v3-cover.spec.ts` verifica il PDF effettivo con Chromium e Poppler:

- nome originale (controllo visivo), JRS Silvateam, nome breve, ragione sociale lunga,
  gruppo con accenti/simboli e ritorno a capo, caso limite di 240 caratteri larghi;
- testo estraibile, assenza del vecchio nome, una sola riga e rispetto dei margini;
- confronto pixel-per-pixel dello sfondo fuori dalla fascia del nome;
- conservazione del numero pagine e del testo delle altre pagine;
- errore con nome vuoto o template non riconosciuto.

Impostare `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` per eseguire la prova
nel runner API. `PQ_COVER_REVIEW_DIR` opzionale conserva PDF/PNG per la revisione visiva.
I dati delle prove sono sintetici; non vengono create presentazioni nel database.
