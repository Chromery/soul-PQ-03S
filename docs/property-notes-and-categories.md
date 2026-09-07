# Note immobile e categorie leggibili — PQ 1.0.3

Nel dettaglio studio, cliccare una riga immobile per aprire il riepilogo “Lista aree”.
Il pannello **Note immobile** mostra e modifica le stesse note della sidebar dell'editor,
anche se non sono presenti planimetria o bozza aree. Il salvataggio usa il campo esistente
`Property.notes` tramite `PATCH /api/properties/:id`: nessuna migrazione, duplicazione
o modifica al contratto ERP, che già esporta questo campo.

Sono disponibili aggiunta, modifica, annullamento e cancellazione del testo (massimo
4.000 caratteri). Un errore di salvataggio mantiene il testo nell'editor del pannello
per consentire un nuovo tentativo. Le note dello studio restano separate.

La colonna **Cat.** in dettaglio studio, archivio immobili e gruppo studi passa da
48–52 a 100 unità di larghezza relativa, con minimo 90. Le preferenze già salvate
più strette vengono rialzate al nuovo minimo dal normale caricamento delle preferenze;
larghezze maggiori e configurazioni delle altre colonne sono conservate. I valori
lunghi possono andare a capo, senza ellissi o sovrapposizioni alle celle adiacenti.

Il test browser `property-notes.spec.ts` usa dati sintetici e intercetta tutte le API
applicative (tranne il login staging reale): prova sincronizzazione riepilogo/editor,
salvataggio fallito e riuscito, annullamento, cancellazione, riapertura e leggibilità
con preferenze precedenti a viewport di 1280, 1024 e 768 pixel. Nessun dato cliente
viene modificato dal test.
