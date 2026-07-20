# Backlog proposto per il restyling

Il backlog è ordinato per dipendenza e rischio. Nessun task altera la logica di calcolo IMU, sincronizzazione ERP, documenti, presentazioni o planimetrie: il restyling deve mantenere parità funzionale verificabile.

## Epic 0 — Baseline e misurazione

- [ ] Inventariare route, componenti, stati, modali e azioni disponibili.
- [ ] Creare una matrice di parità funzionale current/new UI.
- [ ] Definire 8–10 task utente critici e tempi baseline.
- [ ] Aggiungere screenshot regression desktop/tablet/mobile.
- [ ] Rilevare accessibilità: tastiera, focus, contrasto, target e reflow.
- [ ] Intervistare almeno 3 operatori su flusso studio/editor.

**Done:** esiste una baseline ripetibile e ogni nuova schermata può essere confrontata con la UI attuale.

## Epic 1 — Design system minimo

- [ ] Definire color, type, spacing, radius, surface, focus e motion token.
- [ ] Creare Button, IconButton, Input, Select, Checkbox, Badge, Tooltip e Toast condivisi.
- [ ] Creare Card, Drawer, Modal, Details e Accordion con anatomia unica.
- [ ] Creare EmptyState, Skeleton, InlineFeedback e ErrorState.
- [ ] Definire tre density mode: comfortable, operational, compact.
- [ ] Documentare copy pattern per CTA, errori e stati asincroni.

**Done:** nessuna schermata nuova introduce stili locali per i componenti di base.

## Epic 2 — Shell e navigazione

- [ ] Ridisegnare navigation rail espandibile.
- [ ] Unificare command bar, ricerca e contesto temporale.
- [ ] Standardizzare page header, breadcrumb e action hierarchy.
- [ ] Rendere responsive la shell con bottom/navigation drawer mobile.
- [ ] Centralizzare notification center e stato sync.
- [ ] Aggiungere command palette `Ctrl/Cmd + K` realmente operativa.

## Epic 3 — Dashboard e lista studi

- [ ] Portare KPI e “attenzione richiesta” prima della tabella.
- [ ] Unificare ricerca, filtri, viste salvate e configurazione colonne.
- [ ] Rendere le batch action contestuali alla selezione.
- [ ] Introdurre sticky columns e density switch.
- [ ] Separare apertura riga e cambio stato.
- [ ] Creare vista card mobile e tablet.
- [ ] Aggiungere empty/loading/error states reali.

## Epic 4 — Dettaglio studio

- [ ] Compattare header e gerarchizzare Genera presentazione/Invia ERP.
- [ ] Creare checklist di completamento dossier.
- [ ] Ridisegnare lista immobili a due livelli.
- [ ] Portare document readiness e outcome in primo piano.
- [ ] Spostare dettaglio aree in drawer responsive.
- [ ] Raggruppare KPI per rendita, IMU e avanzamento.
- [ ] Verificare layout con 1, 20 e 100 immobili.

## Epic 5 — Editor, fondazioni

- [ ] Scegliere l'architettura editor dopo test dei 5 concept.
- [ ] Definire modello unico per lista/tabella aree.
- [ ] Separare global actions, canvas tools e selection properties.
- [ ] Implementare layout ridimensionabile e Focus mode.
- [ ] Introdurre una toolbar contestuale con stato tool evidente.
- [ ] Unificare drawer di riepilogo, lotto, rendita e IMU.
- [ ] Rendere sempre raggiungibili Salva, undo/redo e stato bozza.

## Epic 6 — Editor, flusso guidato

- [ ] Aggiungere step Documento → Scala → Aree → Valori.
- [ ] Creare empty state per documento mancante.
- [ ] Guidare prima taratura e prima selezione area.
- [ ] Mostrare suggerimenti solo al punto di necessità.
- [ ] Rendere onboarding ignorabile, riprendibile e disattivabile.
- [ ] Esporre shortcut sheet e command palette per esperti.

## Epic 7 — Impostazioni e amministrazione

- [ ] Separare preferenze personali e sistema.
- [ ] Aggiungere navigazione locale per categorie.
- [ ] Dichiarare scope Locale/Organizzazione/Sola lettura.
- [ ] Introdurre save bar per modifiche non salvate.
- [ ] Spostare diagnostica, storage e backup in area amministrativa.

## Epic 8 — Accessibilità e responsive

- [ ] Target minimi e spaziatura conformi a WCAG 2.2 AA.
- [ ] Focus ring comune, focus order e focus non oscurato.
- [ ] Navigazione completa da tastiera dell'editor.
- [ ] Contrast audit light/dark surfaces.
- [ ] Reflow a 320 px senza perdita delle azioni core.
- [ ] Supporto zoom 200%, reduced motion e high contrast.
- [ ] Label accessibili per ogni icon button.

## Epic 9 — Migrazione e rilascio

- [ ] Introdurre feature flag per shell e singole route.
- [ ] Migrare prima lista studi, poi dettaglio, poi editor.
- [ ] Eseguire test di parità su API e calcoli.
- [ ] Raccogliere telemetria di task completion e rollback signal.
- [ ] Pilot con operatori, correzione, rollout progressivo.
- [ ] Rimuovere CSS legacy solo dopo la migrazione completa.

## Sequenza consigliata

| Fase | Contenuto | Output |
|---|---|---|
| 1 | Epic 0–2 | Fondazioni e shell nuova dietro feature flag |
| 2 | Epic 3–4 | Flusso studi completo e responsive |
| 3 | Epic 5 | Editor nuovo con parità funzionale |
| 4 | Epic 6–8 | Onboarding, accessibilità e hardening |
| 5 | Epic 9 | Pilot, rollout e rimozione legacy |

## Criteri di successo

- Nessuna regressione nei task ERP, documenti, IMU, presentazioni ed editor.
- Riduzione del tempo per trovare uno studio e aprire l'immobile da lavorare.
- Riduzione delle azioni errate nella tabella e nell'editor.
- Tutte le funzioni core utilizzabili a 390 px e zoom 200%.
- Nuovo operatore capace di completare il primo immobile senza formazione esterna.
- UI costruita su componenti e token condivisi, non su eccezioni per pagina.

