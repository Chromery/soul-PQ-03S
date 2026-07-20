# Registro dei concept generati

Data: 20 luglio 2026  
Modalità: generazione bitmap con il generatore immagini integrato.  
Formato: PNG, rapporto 3:2 (1536×1024).  

Gli screenshot dello stato attuale sono stati usati come inventario funzionale. I concept non sono specifiche pixel-perfect: servono a discutere architettura dell'informazione, densità, gerarchia e linguaggio visuale. Il testo minuto prodotto dal modello va quindi considerato indicativo e dovrà essere sostituito dai componenti reali in implementazione.

## Dashboard

### `dashboard-quiet-precision.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot dashboard attuale
- Prompt: dashboard desktop high-fidelity in italiano; preservare ricerca, periodo, nuovo studio, filtri, stati, multiselezione, invio ERP, export CSV, KPI, attività, impostazioni e profilo. Direzione “Quiet precision”: rail navy stretta, superfici chiare, blu/cyan/teal, KPI e coda “Richiede attenzione” prima della tabella, toolbar unificata, tipografia leggibile, nessun gradiente, vetro o pill decorative.

### `dashboard-command-center.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot dashboard attuale
- Prompt: reinterpretazione “Command center” per operatori esperti, con rail grafite, fondo off-white, accenti cobalto/ambra/smeraldo, fascia di metriche operative e layout diviso tra tabella e attività/riepilogo. Conservare tutte le funzioni della dashboard e usare etichette italiane nitide, senza effetti decorativi.

### `dashboard-workspace.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot dashboard attuale
- Prompt: reinterpretazione “Workspace” con navigazione superiore, sidebar contestuale per viste salvate e filtri, lista studi centrale e quick-detail drawer collegato alla riga selezionata. Conservare tutte le funzioni, estetica sobria e moderna, nessun gradiente o glassmorphism.

## Onboarding

Tutte le varianti sono edit precise del concept Quiet precision: lo sfondo non viene ridisegnato.

### `onboarding-benefits-modal.png`

- Modalità: `precise-object-edit`
- Prompt: aggiungere soltanto overlay leggero e modale centrale da circa 560 px. Titolo “Benvenuto in Soul PQ”, avanzamento “1 di 3”, tre benefici sintetici, azioni “Salta” e “Inizia il tour”; stessa grammatica navy/cobalto/teal, dismissibile, leggibile, senza elementi aggiuntivi.

### `onboarding-workflow-checklist.png`

- Modalità: `precise-object-edit`
- Prompt: preservare esattamente la dashboard e aggiungere soltanto overlay neutro e pannello destro da 480 px. Titolo “Configura il tuo spazio di lavoro”, “1 di 3 completate”, checklist “Controlla i dati importati dall’ERP”, “Apri il primo immobile”, “Completa aree, rendita e IMU”; azioni “Più tardi” e “Continua”.

### `onboarding-context-spotlight.png`

- Modalità: `precise-object-edit`
- Prompt: preservare la dashboard, attenuare lo sfondo lasciando evidenziato “Nuovo studio” e aggiungere un popover compatto ancorato. Titolo “Inizia da qui”, testo “Crea uno studio manualmente oppure aprine uno importato dall’ERP.”, avanzamento “2 di 3”, “Salta il tour” e “Avanti”.

## Editor

Vincolo comune ai cinque prompt: mantenere, almeno contestualmente, caricamento planimetria, Elab. Planimetrico, elenco subalterni PDF, ForMaps, Earth, Maps, salvataggio; destinazioni d'uso; livelli e Smart Selection; selezione/pan/disegno/righello/undo/redo/elimina; pagina, scala, taratura e zoom; aree con lotto, m², €/m² e valore; prezzario; riepilogo superfici, valore lotto, nuova rendita; IMU attuale e prevista con aliquota, moltiplicatore e formula modificabili.

### `editor-focus-canvas.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot editor attuale, usato solo come inventario funzionale
- Prompt: direzione “Focus canvas”; rail navy stretta, top bar sottile, palette verticale compatta, canvas industriale molto ampio, inspector unico con tab “Selezione / Riepilogo” e drawer “Aree” chiuso a una riga. Progressive disclosure, gerarchia calma e precisione tecnica.

### `editor-workflow-rail.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot editor attuale
- Prompt: direzione “Workflow rail”; stepper superiore “1 Documento / 2 Scala / 3 Aree / 4 Valori e IMU”, step 3 attivo; controlli contestuali a sinistra, canvas centrale e riepilogo live a destra con formula dettagliata collassata.

### `editor-pro-command.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot editor attuale
- Prompt: direzione “Pro command workspace”; canvas quasi full viewport, palette flottante, inspector collassabile, status bar pagina/scala/zoom e command palette aperta “Cerca un comando…” con scorciatoie e risultati come “Disegna area”, “Imposta scala”, “Apri calcolo IMU”.

### `editor-dual-pane-review.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot editor attuale
- Prompt: direzione “Dual-pane review”; 60% canvas e 40% risultati, tab “Aree / Valori / IMU / Documenti”, righe area complete e footer sticky con Nuova rendita, IMU attuale e IMU prevista. Obiettivo: confronto immediato fra documento e calcoli.

### `editor-immersive-canvas.png`

- Modalità: `ui-mockup`
- Riferimento: screenshot editor attuale
- Prompt: direzione “Immersive canvas”; planimetria quasi full-screen, controlli in overlay compatti, inspector selezione richiudibile, summary card in basso a destra e drawer Aree collassato. Massimizzare lo spazio mantenendo accesso a tutte le funzioni.
