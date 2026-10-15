# Dati da raccogliere in PQ per migliorare l'ordinamento

La priorità è distinguere perché un immobile è lavorabile, con quali dati è stato
valutato e che cosa è successo dopo. Accumulare soltanto altri esiti positivi e
negativi renderebbe più grande il campione senza risolverne le ambiguità.

Questa è una proposta di raccolta e modello dati. Non introduce migrazioni né modifica
il database operativo. L'audit usa lo snapshot del 15 ottobre 2026 e lo
[schema Prisma attuale](../../apps/api/prisma/schema.prisma).

## Lacune osservate

| Dato nello snapshot | Osservazione | Conseguenza |
| --- | --- | --- |
| Motivazioni individuali | Note presenti in 5 dei 176 immobili positivi o negativi | Le note di studio non spiegano necessariamente ciascun immobile |
| Unità delle quantità | Nessuna delle 906 selezioni ha un campo esplicito per l'unità di quantità | Campi chiamati m² contengono anche camere, posti e m³ |
| Provenienza del prezzo | Presente in 1 delle 906 selezioni | Il prezzo finale da solo non spiega il criterio o la fonte |
| IMU attuale | Zero in 171 dei 176 immobili con esito | Non possiamo distinguere dato non compilato, simulazione ed esenzione o versamento effettivo |
| Stato della bozza | Tutte le 147 bozze individuali sono `BOZZA` | Non individua il momento di validazione tecnica |
| Storia disponibile | Una StudyVersion per ciascuno dei 68 studi; zero revisioni dei gruppi | Non basta per ricostruire automaticamente i dati disponibili prima di ogni decisione |

Esistono già hash dei documenti, geometrie, scale, correzioni manuali, job AI e snapshot
delle presentazioni. Vanno collegati alle decisioni e integrati, conservando il lavoro
esistente. Gli zeri storici non vanno convertiti tutti in valori fiscali reali o tutti
in dati mancanti senza una verifica della fonte.

## Priorità di raccolta

| Priorità | Famiglia | Campi proposti | Utilità | Raccolta |
| --- | --- | --- | --- | --- |
| P0 | Decisione tecnica ed economica | `technicalOutcome`, `economicOutcome`, `primaryReason`, `secondaryReasons`, `assessmentStage`, `reviewerId`, `decidedAt`, `assessmentSnapshotId` | Separare fattibilità e convenienza; distinguere screening e validazione | Esito e motivo alla chiusura; riferimenti automatici |
| P0 | Unità di analisi | `analysisUnitId`, versione dei `memberPropertyIds`, identificativi catastali, edificio/complesso, società e gruppo societario verificato | Evitare duplicati, assegnare correttamente superfici e risparmi, tenere gruppi collegati insieme nella validazione | Dai collegamenti esistenti, con conferma delle eccezioni |
| P0 | Quantità e destinazioni | `physicalUse`, `valuationUse`, `quantity`, `quantityUnit`, `floorId`, `areaBasis`, `source`, `verificationState` | Confrontare grandezze omogenee; non confondere categoria, uso reale e voce scelta per calcolare | Editor e import; conferma nei casi ambigui |
| P0 | Input al momento della decisione | Revisioni immutabili di documenti, estrazioni, misure, tariffe e composizione del gruppo | Allenare usando soltanto informazioni realmente disponibili prima dell'esito | Automatico a eventi significativi |
| P0 | Motivo della selezione | `candidateBatchId`, eleggibilità e motivo, selezionato/non selezionato, criterio, punteggio e versione, data, eventuale probabilità di campionamento | Misurare la selezione del campione e confrontare algoritmo, tecnico e campione casuale | Automatico nella coda |
| P1 | Caratteristiche fisiche | Anno di costruzione e interventi, altezza, luce, struttura, finiture, stato di conservazione, copertura, uso effettivo | Spiegare differenze tra immobili della stessa categoria e dimensione | Estrarre quando documentato; lasciare sconosciuto il resto |
| P1 | Calcolo e fonti | Prezzo, unità originaria, conversione, fonte/pagina/voce/versione, terreno e oneri inclusi, correttivi e ragione | Ricostruire perché la rendita proposta cambia e verificare i parametri | Automatico dal motore; fonte o motivo per inserimenti manuali |
| P1 | Base fiscale | Annualità, rendita vigente, quota, mesi, aliquota, moltiplicatore, trattamento fiscale e fonte, valore simulato/documentato | Distinguere il margine catastale dal beneficio fiscale concretamente disponibile | Calcolatore, documenti e dati cliente |
| P1 | Esiti successivi | Presentazione inviata, incarico, deposito, accettazione/rettifica/rigetto, rendita finale, date e documenti | Imparare il successo tecnico e commerciale effettivo | Integrazione con ERP e gestione pratica |
| P1 | Economica della pratica | Risparmio annuo proposto/confermato/documentato, compenso concordato/fatturato/incassato, costi diretti | Ordinare per valore atteso di Soul, distinto dal risparmio del cliente | ERP e amministrazione |
| P2 | Efficienza operativa | Tempi attivi per fase, acquisizioni, rilavorazioni, motivo della correzione AI | Stimare costo di lavorazione e decidere quali documenti acquisire prima | Eventi applicativi, escludendo inattività e attese |

P0 indica il primo intervento consigliato. Le famiglie P1 possono essere introdotte
progressivamente, iniziando dagli eventi già disponibili nell'ERP.

## Motivi degli esiti

Un negativo non dovrebbe essere un'unica classe indistinta. Il giudizio tecnico
(margine sostenibile, non sostenuto, da verificare) e quello economico (sufficiente,
insufficiente, sconosciuto) sono separati: una riduzione sostenibile ma piccola può
essere positiva per il primo e negativa per il secondo. I motivi possono includere:

- Rendita coerente con le caratteristiche note.
- Margine tecnico plausibile: superfici, destinazioni, parametri costruttivi,
  componenti o classificazione da rivedere, con uno o più motivi specifici.
- Riduzione potenziale presente ma beneficio economico insufficiente.
- Trattamento fiscale che limita il beneficio, da verificare o già documentato.
- Documentazione o misura insufficienti: valutazione non conclusa.
- Controversia o altro presupposto tecnico da risolvere: valutazione sospesa.
- Altra motivazione, con breve nota.

La classificazione deve consentire motivo principale e motivi secondari. Un rifiuto
del cliente, una blacklist o l'assenza di contatto appartengono a una decisione
commerciale separata e non trasformano automaticamente un positivo tecnico in negativo.
Un immobile non analizzato conserva questo stato, senza diventare negativo.

Il motivo proposto dall'AI può essere precompilato ma richiede conferma umana, con
registrazione della sua origine. Confidenza della macchina e validazione del tecnico
sono due campi distinti. Le motivazioni storiche inferite dalle note restano marcate
come inferite finché non verificate.

Conservare anche la versione dei criteri di eleggibilità e convenienza applicati:
esclusioni, eventuali soglie dichiarate da Soul, compenso e costo previsto. Se la
politica commerciale cambia, due valutazioni tecnicamente identiche possono avere
esiti di lavorabilità diversi. Non dedurre soglie rigide dal minimo osservato fra
i positivi storici.

## Descrivere gli spazi senza perdere il significato

Separare almeno destinazione fisica, configurazione costruttiva e piano. Una tettoia
può servire come deposito; un interrato può ospitare un'autorimessa, un archivio o una
funzione produttiva. Questi attributi non sono alternative dello stesso elenco.

La quantità impiegata nel calcolo deve avere un'unità esplicita: m², m³, camera,
posto letto, posto auto, posto a sedere, metro lineare, elemento. Conservare separatamente
la superficie geometrica eventualmente disponibile. Non sommare camere e m² in un
unico totale; non convertire automaticamente una tariffa al m³ senza la relativa altezza.

Per le superfici distinguere superficie lorda/netta, superficie dei piani, sedime a
terra, lotto, spazi scoperti e tettoie. Conservare subalterni beneficiari delle parti
comuni, regola e quota di attribuzione quando applicabili; se non sono note, registrare
l'incertezza senza dividerle arbitrariamente.

Ogni misura deve specificare se proviene da geometria del PDF, quota esplicita,
documento del cliente, rilievo, dichiarazione o ipotesi del tecnico. La bozza dello
studio 4654 contiene grandi superfici manuali accompagnate da richiesta di verifica:
il fatto che un numero sia stato salvato non equivale a una misura confermata.

## Provenienza e tempo

Per ogni fatto estratto o confermato conservare valore, unità, documento e revisione,
pagina e posizione, estratto probatorio, metodo, versione dell'estrattore, eventuale
intervallo e stato di verifica. Un valore non leggibile è sconosciuto, non zero.

Servono date con significati diversi: data dell'atto, periodo di validità del fatto,
momento di acquisizione in PQ (`availableAt`), estrazione, revisione e decisione.
La data di una variazione catastale non è automaticamente l'anno di costruzione.
La data di creazione originaria dello studio non dimostra quando tutti gli input
sono diventati disponibili al tecnico.

Quando un documento viene sostituito, la valutazione storica deve continuare a puntare
alla sua versione originale, identificata dall'hash e recuperabile. L'attuale vincolo
un documento per immobile e tipo può restare per la vista corrente, affiancato da
revisioni storiche. Analogamente una bozza modificabile non sostituisce lo snapshot
immutabile dell'analisi usata per decidere.

## Modello dati proposto

Sono entità concettuali da dettagliare prima dell'implementazione, non nuovi campi
obbligatori tutti nella tabella Property:

| Entità | Relazione e contenuto |
| --- | --- |
| `AnalysisUnitRevision` | Immobile/gruppo, membri e perimetro validi per quella versione |
| `DocumentRevision` | Documento originale, tipo effettivo, hash, date e legami agli atti precedenti |
| `FeatureObservation` | Fatto, unità, fonte, evidenza, disponibilità temporale e revisione umana |
| `SpaceComponent` | Destinazione, struttura, piano, geometria e quantità impiegata nella valutazione |
| `AssessmentSnapshot` | Input, parametri e versione del calcolo, risultati e ipotesi congelati |
| `DecisionEvent` | Decisione tecnica, economica o commerciale, motivi, autore, data e snapshot di riferimento |
| `RankingEvent` | Universo dei candidati, esclusioni, punteggi, modello, selezione ed esposizione al tecnico |
| `CaseMilestone` | Avanzamento ed esiti documentati della pratica e del rapporto commerciale |
| `BenefitObservation` | Importi con natura proposta/confermata/documentata, periodo, fonte e componenti |

Gli eventi devono essere idempotenti in caso di ritrasmissione ERP. Le correzioni
aggiungono una revisione che sostituisce logicamente la precedente; la vista corrente
mostra l'ultima versione valida senza perdere la storia utilizzata per addestrare.

Una probabilità va salvata come tale solo se il modello la produce e se ne conosce
la calibrazione. Un punteggio euristico resta un punteggio. Registrare anche se il
tecnico aveva già visto il suggerimento AI quando ha espresso il giudizio, perché
quel giudizio può esserne influenzato.

## Un'interazione breve per il tecnico

Al termine della valutazione chiederei tre informazioni: esito tecnico, motivo
principale e stato di verifica dei dati essenziali. La lista degli elementi mancanti
può essere proposta dall'applicazione. Una nota libera breve serve solo quando il
motivo non è già rappresentato o occorre spiegare un'eccezione.

Documenti, membri, misure, prezzi, revisioni, tempi e versione del modello possono
essere catturati automaticamente durante le operazioni già esistenti. Non chiederei
al tecnico di reinserire superfici o compilare decine di attributi mancanti per chiudere
uno studio. Per i casi nuovi, pochi esempi scelti casualmente oltre alla coda ordinata
permetteranno di misurare il rendimento senza osservare soltanto quelli che il modello
ha già favorito.
