# Valore ottimizzazione — PQ 1.0.4

Il riepilogo dello studio include un quinto riquadro **Valore ottimizzazione**,
espresso in euro: somma delle rendite attuali meno somma delle rendite attribuibili
degli immobili presenti nei dati della presentazione. È lo stesso totale mostrato
come “Differenza rendita” nell'anteprima e nel PDF; positivo per una riduzione,
negativo per un aumento, senza conversioni percentuali o moltiplicatori.

Il calcolo riusa `presentationDraftTotals` e segue anche le modifiche manuali nei
dati della presentazione. Non modifica le stime salvate nell'editor e non è un nuovo
campo DB/API. Il riquadro “Differenza rendita” preesistente resta invariato, con la
sua convenzione (proposta meno attuale). Il sottotitolo del nuovo riquadro esplicita
l'origine del dato e la formula.

In presenza di righe non valide il nuovo riquadro mostra “n.d. / Da completare”,
per evitare di mostrare un totale parziale come definitivo. Le regole della
presentazione, inclusa la gestione dei campi IMU vuoti, rimangono invariate.

Test `study-optimization.spec.ts`: totale di più immobili con centesimi, riduzione,
aumento, zero, override manuali, campi non validi, ripristino e layout responsive
a 1920/1280/768/390 pixel. Dati sintetici, API applicative intercettate e nessuna
modifica ai dati del cliente.
