# Direzione visuale proposta

## Posizionamento

L'interfaccia deve sembrare uno strumento professionale di analisi immobiliare, non un pannello amministrativo generico. La direzione raccomandata è **Quiet precision**: sobria, nitida e contemporanea, con accenti cromatici usati per significato e non come decorazione.

## Fondamenta visuali

- **Canvas app:** grigio freddo chiarissimo, non bianco assoluto.
- **Surface:** bianco caldo per pannelli operativi e bianco freddo per dati.
- **Brand:** blu profondo con accento cyan/teal; l'azzurro elettrico resta per la primary action.
- **Semantica:** verde bosco, ambra, rosso corallo e viola usati sempre con icona e testo.
- **Tipografia:** sans neo-grotesk leggibile; numeri tabulari per valori economici e catastali.
- **Raggio:** 10–14 px per pannelli, 8–10 px per controlli; niente pill indiscriminate.
- **Ombre:** quasi assenti; gerarchia ottenuta con tono, bordo e spazio.
- **Spaziatura:** scala 4/8/12/16/24/32; densità deliberate, non casuali.
- **Motion:** 120–180 ms per stati locali, 220–280 ms per drawer e pannelli; rispetto di `prefers-reduced-motion`.

## Anatomia globale

- Navigation rail compatta, espandibile e coerente in tutta l'app.
- Command bar superiore con ricerca globale e contesto corrente.
- Page header compatto: breadcrumb, titolo, stato, primary action e menu secondario.
- Feedback locale vicino all'azione; notification center per gli eventi asincroni.
- Componenti data-dense con modalità comfortable/compact.

## Tre direzioni esplorate per dashboard/studi

### A — Quiet precision (raccomandata)

Rail scura stretta, superfici chiare, KPI in alto e tabella ampia. È la direzione più facile da introdurre progressivamente senza cambiare il modello mentale corrente.

### B — Command center

Header e filtri più analitici, blocco “attenzione richiesta” evidente, densità superiore. Adatta a operatori esperti, ma richiede più disciplina nella scelta delle metriche.

### C — Workspace

Navigazione superiore, sidebar contestuale e lista studi più simile a un workspace. È la più moderna e spaziosa, ma anche la più distante dall'architettura attuale.

## Onboarding esplorato

1. **Benefits modal:** valore del prodotto e tre benefici, adatto al primo accesso.
2. **Workflow checklist:** configurazione operativa in tre attività, adatta a utenti che devono essere produttivi subito.
3. **Context spotlight:** breve aiuto agganciato alla prima azione, adatto a feature nuove e utenti già esperti.

## Cinque architetture per l'editor

1. **Focus canvas — raccomandata:** palette compatta a sinistra, canvas dominante, inspector a destra e drawer aree unico.
2. **Workflow rail:** percorso Documento/Scala/Aree/Valori visibile; ottimo per nuovi operatori.
3. **Pro command workspace:** command palette, floating toolbar e inspector contestuale; ottimo per power user.
4. **Dual-pane review:** documento e risultati affiancati; ottimo per validazione e confronto.
5. **Immersive canvas:** pannelli overlay richiamabili e canvas quasi full-screen; massimizza lo spazio, richiede onboarding migliore.

## Design token da definire prima del codice

- primitive e semantic color token;
- type scale, numeri tabulari e truncation rules;
- elevation/border/surface roles;
- spacing, radius e control height;
- focus, hover, active, selected, disabled e loading;
- breakpoint e density mode;
- motion duration/easing;
- z-index e overlay policy.

Material 3 descrive i design token come decisioni riutilizzabili che compongono lo stile del sistema; il nuovo frontend adotterà token semantici, senza copiare un tema Material predefinito: [Material 3 theming](https://developer.android.com/codelabs/m3-design-theming).

