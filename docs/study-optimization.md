# Valore ottimizzazione — PQ 1.1.2

## Regola corrente

Formula in euro: somma **R.C. attuale − R.C. attribuibile dei soli immobili con esito Positivo**.
Il criterio è l'esito assegnato dall'operatore, non il segno numerico del risparmio:
Negativi, Neutri e Sospesi non contribuiscono. Nessun positivo = 0,00 €.

Riquadro e anteprima usano le rendite della bozza, comprese le modifiche persistenti,
arrotondate ai centesimi prima della somma. Una rendita positiva vuota/non valida dà
n.d., non un totale parziale. IMU/indirizzi non validi non alterano questa metrica.
“Differenza rendita” e stime dell'editor restano invariati.

Nelle nuove presentazioni v3 il riepilogo “Valore ottimizzazione · solo positivi”
sostituisce “Differenza rendita catastale”, con la stessa formula sui positivi
**selezionati** e gli override della presentazione. Gli altri immobili selezionati
restano in tabella e nei suoi totali aritmetici, ma non contribuiscono a questa metrica.
La riduzione nel PDF resta verde e con il meno (convenzione grafica precedente),
mentre API/riquadro esprimono un risparmio positivo. Esiti/metrica sono congelati
nello snapshot; i deck storici mantengono il rendering precedente.

Il pull ERP aggiunge `metriche.valore_ottimizzazione`: stringa con due decimali o
null per rendite non valide. Usa le stime effettive PQ e gli override della bozza
dello studio, il cui timestamp entra in `modificato_il` anche senza nuovi PDF.
Le bozze di gruppo restano indipendenti. Il sync di import non accetta né
sovrascrive questa metrica derivata e non genera PDF.

Swagger OpenAPI 1.5.0: `GET /api/system/erp-openapi`, download YAML riservato a
sessioni Clerk amministratore (401 anonimo, 403 operatore; il token ERP non vale).
Pulsante “Scarica Swagger ERP” nelle Impostazioni. Il file distribuito è quello
versionato in `docs/openapi/erp-pq-sync.openapi.yaml`, non una copia pubblica statica.

## Comportamento precedente (1.0.4, superato)

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
