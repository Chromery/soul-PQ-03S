# Review UX/UI — stato attuale

Data review: 20 luglio 2026  
Ambito: dashboard/studi, dettaglio studio, editor planimetrico, impostazioni e viewport mobile.  
Metodo: walkthrough dell'applicazione reale a 1440×1000 e 390×844, inventario dei componenti e confronto con pattern di design system correnti.

## Executive summary

La webapp è funzionalmente ricca e permette già di completare il flusso operativo, ma la UI comunica quasi sempre **tutto nello stesso momento**. Il risultato è una gerarchia debole: azioni primarie, dati di contesto, impostazioni rare e strumenti avanzati hanno spesso lo stesso peso visivo.

Il restyling non dovrebbe limitarsi a colori, bordi e ombre. Il miglioramento principale arriverà da:

1. rendere esplicito il flusso operativo;
2. mostrare gli strumenti nel momento in cui servono;
3. separare lettura, selezione e modifica;
4. trasformare davvero la UI sui viewport stretti;
5. costruire un piccolo design system condiviso.

## Cosa funziona già

- Il prodotto usa una terminologia abbastanza aderente al lavoro catastale.
- Stati, differenze economiche e disponibilità documenti sono esposti senza dover aprire più applicazioni.
- Il salvataggio dell'editor comunica data e stato.
- I calcoli IMU mostrano formula e provenienza, creando fiducia nel risultato.
- Le azioni avanzate sono presenti e il lavoro non dipende da flussi nascosti.

## Problemi trasversali

| Priorità | Problema | Evidenza | Conseguenza | Miglioramento proposto |
|---|---|---|---|---|
| P0 | Gerarchia delle azioni debole | Molti pulsanti con dimensioni e peso simili in hero, toolbar e tabelle | L'operatore deve rileggere la schermata per capire il passo successivo | Una sola primary action per contesto; azioni secondarie in menu coerenti; azioni distruttive separate |
| P0 | Responsive non trasformativo | La tabella studi viene compressa e tagliata a 390 px | Dati illeggibili e colonne irraggiungibili | Card/list view mobile, colonne configurabili su tablet, tabella completa solo desktop |
| P0 | Densità priva di livelli | Tabelle lunghe, card annidate, mini-label e controlli convivono nello stesso piano | Affaticamento visivo e lentezza di scansione | Tre densità dichiarate: overview, operational, data-dense; progressive disclosure |
| P1 | Incoerenza dei pattern | Toggle, dropdown, collapse, toolbar e badge hanno anatomie vicine ma non uniformi | Aumenta il carico di apprendimento | Component library con token, stati, dimensioni e copy pattern condivisi |
| P1 | Target piccoli e ravvicinati | Icon button e comandi tabellari sono spesso compatti | Errori di click, soprattutto su touch o trackpad | Target minimo 36 px in modalità dense e 44 px per azioni primarie; spaziatura costante |
| P1 | Focus e stato attivo poco evidenti | Diversi controlli dipendono da bordo o variazioni cromatiche leggere | Navigazione da tastiera e stato corrente meno leggibili | Focus ring condiviso ad alto contrasto e stato selected distinto da hover |
| P1 | Colore usato come segnale dominante | Verde, rosso, azzurro e viola indicano stati in molti punti | Scansione fragile in condizioni di bassa percezione cromatica | Colore + icona + etichetta; palette semantica verificata |
| P2 | Copy tecnico e abbreviazioni | Label come “Diff. rendita”, “Sub.” o stati infrastrutturali compaiono senza contesto | Onboarding più lento | Label complete nelle viste di lettura; abbreviazioni solo nelle tabelle dense con tooltip |
| P2 | Feedback disperso | Toast, stato salvato e badge appaiono in aree diverse | L'esito di una modifica può passare inosservato | Centro notifiche locale al task più una cronologia non invasiva |

WCAG 2.2 indica 24×24 CSS px come minimo per i target pointer, con 44×44 px come obiettivo enhanced per i controlli importanti. La nuova UI adotterà 36 px come minimo operativo desktop e 44 px per touch e azioni principali. Il focus userà un contorno percepibile di almeno 2 px. Fonti: [W3C target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance).

## Dashboard e lista studi

### Cosa non va

- I KPI e le attività recenti arrivano dopo decine di righe: l'overview è fisicamente sotto il dettaglio.
- La tabella espone troppe colonne come default e non protegge le colonne che identificano lo studio.
- Filtri, selezione multipla ed export occupano righe separate anche quando non sono attivi.
- Le azioni disabilitate restano molto presenti e sottraggono attenzione.
- Il cambio di stato inline sembra un normale dato di tabella e può essere modificato accidentalmente.
- Le righe non mostrano con chiarezza “cosa richiede attenzione adesso”.
- Su mobile la tabella rimane una tabella desktop in miniatura.

### Come migliorarla

- Portare in alto 4 KPI operativi e una coda “Da completare oggi”.
- Usare una toolbar unica con ricerca, viste salvate, filtri e azioni batch contestuali.
- Rendere sticky identificazione e stato; rendere configurabili le colonne economiche.
- Aggiungere una vista card realmente mobile con due azioni principali per studio.
- Separare apertura della riga e modifica dello stato; la modifica deve essere intenzionale.

Carbon raccomanda di collocare le azioni sugli elementi selezionati nella toolbar o in una batch action mode coerente, invece di mantenerle sempre tutte visibili: [Carbon data table usage](https://carbondesignsystem.com/components/data-table/usage/).

## Dettaglio studio

### Cosa non va

- La hero è alta ma il contenuto decisionale è ridotto; le azioni sono distribuite su due righe senza priorità.
- La tabella immobili supera lo spazio disponibile già a 1440 px.
- Stato documenti, outcome e differenze importanti finiscono nelle colonne lontane.
- I riepiloghi economici ripetono numeri senza spiegare quali richiedano un intervento.
- L'apertura del dettaglio aree tramite click sulla riga non è sufficientemente esplicita.

### Come migliorarla

- Header compatto con stato, prossima scadenza e una CTA primaria.
- Barra di completamento del dossier: documenti, editor, esito, presentazione, sync ERP.
- Riga immobile a due livelli: identità e dati catastali sempre visibili; valori e documenti in una seconda fascia.
- Drawer laterale per il dettaglio, evitando modali molto estese.
- Insight espliciti: “2 immobili senza esito”, “1 planimetria mancante”, “IMU prevista −97,4%”.

## Editor planimetrico

### Cosa non va

- Quattro superfici operative competono per lo spazio: palette sinistra, toolbar, tabella inferiore e riepilogo destro.
- “Aree selezionate” è rappresentato sia come tabella sia come lista, con funzioni sovrapposte.
- Azioni documentali, navigazione esterna e salvataggio sono tutte nella stessa toolbar.
- I tool di disegno, la taratura, la scala e le impostazioni di selezione sono frammentati.
- L'azione o modalità attiva è indicata in modo troppo sottile rispetto alla complessità del canvas.
- Il canvas non è abbastanza dominante: a 1440 px rimane una finestra relativamente stretta.
- I controlli esperti sono sempre vicini a quelli quotidiani.
- Mancano un percorso guidato e un “prossimo passo” per chi apre l'editor per la prima volta.

### Come migliorarlo

- Canvas centrale dominante con toolbar contestuale e inspector unico.
- Un solo modello per le aree: tabella/drawer adattivo, non lista e tabella simultanee.
- Flusso in quattro fasi visibili: Documento → Scala → Aree → Valori e IMU.
- Comandi globali nel top bar; comandi del tool vicino al canvas; proprietà della selezione nell'inspector.
- Modalità Focus per nascondere tutto tranne canvas e tool correnti.
- Command palette e shortcut sheet per power user, senza dipendere da icon button ambigui.
- Empty state e onboarding contestuale per PDF, scala e prima area.

Per contenuti secondari e brevi è preferibile un details compatto; gli accordion sono più adatti a gruppi multipli e strutturati. Questa distinzione guiderà la semplificazione dei numerosi collapse: [GOV.UK accordion guidance](https://design-system.service.gov.uk/components/accordion/).

## Impostazioni

### Cosa non va

- Preferenze dell'operatore e diagnostica infrastrutturale condividono la stessa pagina.
- Le card tecniche hanno lo stesso peso delle impostazioni modificabili.
- Non è chiaro quali modifiche siano locali al browser e quali siano globali.
- I comandi “Salva”, “Ripristina”, “Aggiorna stato” e “Backup ora” seguono logiche differenti.

### Come migliorarla

- Navigazione locale: Generale, Editor, Integrazioni, Documenti, Sistema.
- Separare “Preferenze personali” da “Amministrazione sistema”.
- Barra di salvataggio sticky solo quando esistono modifiche non salvate.
- Badge espliciti “Locale”, “Organizzazione”, “Sola lettura”.
- Log e diagnostica dietro un livello amministrativo.

## Onboarding

### Principi

- Mostrare due o tre benefici prima dei dettagli tecnici.
- Rendere ogni onboarding ignorabile e riapribile.
- Preferire messaggi contestuali brevi dopo che il sistema rileva l'intento dell'utente.
- Non coprire il canvas con tour lunghi durante un lavoro in corso.

Atlassian suggerisce spotlight focalizzati su un singolo cambiamento, messaggi brevi e sempre un'opzione per ignorare o interrompere; raccomanda inoltre di concentrarsi sui due o tre benefici principali: [Atlassian onboarding spotlight](https://atlassian.design/patterns/first-impressions/).

## Principi di prodotto per il restyling

1. **Quiet by default, powerful on demand.** La prima vista è leggibile; la potenza emerge in modo contestuale.
2. **One task, one visual center.** Ogni schermata ha un solo centro operativo.
3. **Trust through provenance.** Formula, fonte e override rimangono visibili quando servono.
4. **Same meaning, same component.** Stato, documento, azione e valore economico hanno un unico pattern.
5. **Desktop-first, not desktop-only.** Mobile e tablet cambiano struttura invece di ridursi.
6. **Reversible actions.** Override, eliminazioni e aggiornamenti espongono sempre stato e recupero.

Questi principi seguono anche l'indicazione USWDS di partire dai bisogni reali, guadagnare fiducia e promuovere continuità fra servizi e dispositivi: [USWDS design principles](https://designsystem.digital.gov/design-principles/).

