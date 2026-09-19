# Laboratorio prezzari — branch `analisi-prezzari`

## Obiettivo e perimetro

Prototipo pubblicato **solo in staging**, separato da `main`: trasformare i prezzari forniti in un catalogo interrogabile e proporre al tecnico varianti pertinenti, senza modificare automaticamente le valutazioni.

La schermata è `/prezzari`; nell’editor il pulsante con le scintille accanto al prezzo unitario apre lo stesso motore di ricerca, già contestualizzato all’immobile e alla destinazione dell’area. Il prezzo manuale resta disponibile. Non vengono modificati gli import ERP, i dati degli studi esistenti o la produzione.

## La scelta progettuale

Non esiste un unico «prezzo al m²» per provincia e tipologia. I documenti differiscono per unità di misura, epoca economica, terreno incluso/escluso, oneri, finiture, luci, altezze, piano, dimensione dell’edificio e presenza di impianti. Il sistema conserva quindi **una voce per variante**, con documento, SHA-256, pagina, codice, importo originale, unità, valuta, condizioni e citazione controllabile.

Il flusso è:

1. Inventario e deduplicazione degli originali.
2. Lettura del testo pagina per pagina; OCR delle scansioni e controllo aggiuntivo delle pagine con poco testo.
3. Estrazione strutturata una tantum con NeuralWatt `deepseek-v4-flash`.
4. Riscontro deterministico di estratto e cifre, controllo delle unità, esclusione di esempi e voci ambigue.
5. Secondo passaggio semantico separato sui costi potenzialmente applicabili: può **escludere** una voce, mai inventare o correggere un prezzo.
6. In uso quotidiano: ricerca e ordinamento deterministici, **senza chiamate LLM**.
7. Scelta esplicita del tecnico, con verifica della fonte. Solo allora si applica il prezzo alla singola area; il normale salvataggio conserva anche la provenienza.

Il secondo passaggio controlla soprattutto gli errori che una corrispondenza numerica non scopre: prezzo assegnato alla colonna o alla tipologia sbagliata, condizioni territoriali perse, costo di un componente confuso con quello dell’intero edificio. Rimane un controllo automatico, non una certificazione professionale. Le voci in attesa di questo passaggio non sono applicabili.

## Primo caso: Milano

Fonte: `Milano.pdf`, 16 pagine PDF. I numeri di pagina nell’interfaccia sono quelli del **file PDF**, non la numerazione interna del prontuario.

- Epoca economica: **1988–1989**, distinta dalla nota di trasmissione del 2017.
- I costi comprendono oneri e profitto secondo la metodologia della fonte; il terreno è escluso.
- Capannoni, §2.4, pagina PDF 7: **165 / 214 / 248 €/m²**, rispettivamente per luce fino a 15 / 20 / 30 m, nel caso base di altezza fino a 5 m.
- Altezza oltre 5 m: +5% per metro, massimo +10%; il motore esplicita questo correttivo nella formula. Copertura a shed e altri correttivi **non vengono applicati implicitamente**.
- Uffici §3.1.1, pagina PDF 8: **155 / 207 / 250 / 400 €/m³**, non €/m². Per la conversione occorre l’altezza equivalente, coerente con volume e superficie utilizzati nella stima.
- La stessa fonte indica per questi uffici un’altezza virtuale di 3–3,3 m. È disponibile un pulsante per provare lo **scenario 3,15 m**, punto medio dichiarato di quell’intervallo. Non è presentato come altezza misurata o statisticamente più comune.
- Camere d’albergo, posti auto, recinzioni e impianti conservano la loro unità originaria; un prezzo a posto o a metro lineare non diventa un prezzo al m².

Esempio riproducibile: capannone con luce 20 m e altezza 7 m → `214 × 1,10 = 235,40 €/m²`, prima degli altri correttivi eventualmente necessari.

## Secondo caso: Bergamo

La nota `PREZZI FABBRICATI D BG.pdf` **non contiene un tariffario condiviso**: viene classificata come documento di supporto, senza inventarne valori.

`Bergamo/preziario bergamo.pdf`, pagina PDF 49, presenta invece un **costo più frequente esplicitamente riferito a uno scenario**: deposito sotto 1.000 m², altezza 6–7 m, piano terra. I valori sono:

| Zona        | Costruzione €/m² | Terreno €/m² |
| ----------- | ---------------: | -----------: |
| A / Bergamo |              270 |        30–50 |
| B           |              250 |        20–30 |
| C           |              240 |        15–25 |
| D           |              220 |        15–25 |
| E           |              210 |        10–20 |

L’allegato `Bergamo/zone dei comuni.pdf` permette di associare il comune alla zona. Se la zona non è determinabile, non viene presunta: il tecnico può indicarla esplicitamente dopo aver consultato l’allegato.

La pagina 50 introduce correttivi per superficie, altezza, piano e destinazione. Sono resi visibili nelle condizioni del caso base, ma **non moltiplicati automaticamente**: la superficie di una singola area disegnata non è necessariamente la superficie complessiva dell’edificio a cui si riferisce la tabella.

## Iterazioni sugli altri documenti

### Lecco: formule, non semplici prezzi fissi

Il confronto visivo della pagina 6 ha evidenziato che, per alcune fasce di superficie, il primo numero della cella è soltanto una componente della formula. Per esempio, copertura piana, superficie 501–1.600 m²: `Cs = 166 + 40 × (1600 − S) / 1100`, con maggiorazione del 2,70% per metro oltre h 4 m. Per **S = 600 m² e h = 5 m** il risultato è **207,83 €/m²**, non 166 €/m².

Il motore gestisce le otto varianti della pagina con formule dichiarative, senza eseguire codice estratto dal PDF. La superficie dell’edificio deve essere inserita esplicitamente; non viene dedotta dalla singola area disegnata. Le formule non riconosciute restano consultabili ma non applicabili come un prezzo costante. La pagina 2 di Lecco esclude terreno, oneri e profitto dai soli costi di costruzione.

### Altre distinzioni rilevanti

- **Friuli Venezia Giulia, edizione regionale aggiornata a dicembre 2025:** le pagine 3 e 6 spiegano il passaggio dai quattro prontuari provinciali a un riferimento unico e definiscono esplicitamente il valore “ordinario”. Questa fonte ha precedenza nell’ordinamento, mantenendo consultabili le precedenti. A pagina PDF 16 il sistema conserva le varianti per struttura e superficie dei capannoni/magazzini e applica, se indicata l’altezza, il +5% per metro oltre H piano 5 m. Esempio: capannone metallico fino a 2.000 m², h 7 m → `120 × 1,10 = 132 €/m²`. Lo scostamento ammesso ±25% non viene applicato senza una motivazione tecnica.
- **FVG, Appendice A:** le cinque coppie minimo/massimo delle zone del suolo sono lette con un parser strutturale verificato. Le coppie assenti `- / -` non spostano le colonne successive. Valuta, unità e biennio sono dichiarati a pagina PDF 3; il secondo controllo semantico resta obbligatorio. Le zone censuarie di Trieste restano varianti esplicite da scegliere, non vengono dedotte dal solo comune.
- **Bari:** pagina 12 dichiara che i valori delle costruzioni comprendono già il suolo. La consultazione è possibile, ma l’applicazione diretta di queste voci è bloccata: aggiungere il lotto già previsto dall’editor produrrebbe una duplicazione. Serve una scelta metodologica esplicita del tecnico.
- **Campobasso:** la pagina 19 dichiara analogamente l’inclusione dell’area di sedime nelle costruzioni, separando la pertinenza esterna. È applicata la stessa protezione. Anche le singole voci degli altri documenti vengono controllate per dichiarazioni esplicite di terreno incluso, senza confonderle con un’indicazione di ubicazione o con un’esclusione.
- **Bologna:** gli esempi numerici sul calcolo dell’area eccedente non sono tariffe autonome; vengono esclusi dalle proposte applicabili.
- **Ancona e altri esempi compilati:** titoli di esempi applicativi, modelli 2NB e tabelle di calcolo con vetustà non diventano tariffe autonome, anche quando cifra ed estratto sono corretti e il secondo controllo automatico li accetta. Questo controllo aggiuntivo deriva dalla revisione delle pagine 51–56 di Ancona.
- **Modena:** i prezzi rurali distinti per comune vengono filtrati territorialmente anche se riguardano costruzioni e non terreno. Dighe, pozzi piezometrici e altre opere idrauliche al m³ non sono convertibili usando l’altezza di un edificio: restano esclusi dall’applicazione diretta.
- **Varese e allegati territoriali:** le lunghe tabelle vengono suddivise in pagine e, quando necessario, frammenti con intestazioni di contesto. I valori del terreno riferiti a un comune non sono trattati come prezzi provinciali generici.
- **Tariffe per elenchi di comuni:** tutti i comuni riconosciuti nell’elenco vengono associati alla voce (ad esempio i raggruppamenti di Ancona), non soltanto il primo. I nomi contenuti dentro un altro nome non generano false associazioni: Castelnuovo del Garda non implica automaticamente Garda.
- **Codifiche territoriali:** i suffissi catastali `/sez.A`, `/sez.B`, ecc. non impediscono il confronto del comune; le sigle storiche PS/FO sono ricondotte a PU/FC. Non vengono inventate equivalenze per abbreviazioni ambigue dei comuni.
- **Como, tabella territoriale:** il PDF All1 e l’Excel All3 contengono intervalli interi, spesso senza valuta ripetuta. La selezione delle pagine include anche queste tabelle. Le voci restano da riconciliare perché All4, pagina 3, distingue superficie del lotto per destinazioni produttive e volume edificato per destinazioni terziarie: non si assegna arbitrariamente €/m² a tutte le colonne. La cifra anomala 45931 è presente anche nell’originale e non viene corretta per supposizione.
- **Bolzano e documenti storici:** conservazione della valuta originale; conversione lire/euro soltanto con il cambio fisso **1 euro = 1.936,27 lire**. Nessuna rivalutazione temporale automatica. Riferimento: [Commissione europea — Italy and the euro](https://economy-finance.ec.europa.eu/euro/eu-countries-and-euro/italy-and-euro_en).
- **Napoli ACEN 2021:** costi edilizi contemporanei separati dai prontuari catastali; non resi direttamente applicabili come se fossero già ricondotti al biennio 1988–1989.
- **Documenti scansionati:** l’OCR non viene confuso con testo nativo; il metodo di lettura resta visibile e la pagina originale è sempre accessibile.
- **Lecco e codifiche PDF danneggiate:** la sola quantità di testo non basta. Il controllo di caratteri di controllo e glifi anomali ha identificato pagine apparentemente testuali ma illeggibili; sono state rilette con OCR, conservando il testo originale in cache.
- **Catania, tabella 3:** i valori unitari centrali OMI sono riferimenti per un metodo di surrogazione, non prezzi di costruzione da copiare direttamente nell’area. Restano dati di consultazione, esclusi dall’applicazione automatica.
- **Genova:** le tabelle di valori di mercato sono separate dai costi di costruzione anche quando l’unità è identica, €/m².
- **Roma 1995:** i valori di mercato in lire per capannoni/edifici non diventano costi di costruzione solo perché convertibili in €/m². Queste voci rimangono escluse dall’applicazione diretta, anche quando il controllo numerico conferma la corretta estrazione.
- **Fogli Excel:** letti senza eseguire formule, macro o collegamenti esterni. I risultati memorizzati delle formule non diventano tariffe autonome. La tabella statica Como All3 viene letta deterministicamente cella per cella, conservando coordinate e intervalli; le intestazioni incomplete impediscono di attribuire arbitrariamente valuta/unità e quindi di applicarla direttamente. Gli altri fogli, che sono calcolatori, restano documenti di supporto.
- **Copie identiche:** accorpate per hash. In particolare i file denominati «Regione Piemonte 2021» e «Regione Piemonte 2025» hanno contenuto identico: il nome non prova l’esistenza di una nuova edizione.
- **Oggetto della tariffa:** gli uffici all’interno di un capannone rimangono uffici; un centro commerciale che comprende anche uffici non viene consigliato come tariffa dei soli uffici. Terreno e sistemazioni esterne sono categorie di costo distinte.

## Ordinamento e “caso più probabile”

L’ordinamento considera provincia, eventuale fonte regionale, destinazione, comune/zona quando identificabili e variante ordinaria esplicitamente descritta dalla fonte. Non esiste un dataset osservazionale da cui stimare una vera probabilità: il sistema **non espone percentuali di confidenza inventate** né spaccia il prezzo minimo per il caso più comune.

Quando la fonte descrive un caso frequente, come a Bergamo, viene evidenziato con le sue condizioni. Per gli intervalli di prezzo viene proposto il punto medio, dichiarandolo come scenario e non come moda statistica. Per un costo volumetrico senza altezza nota, l’applicazione resta bloccata finché il tecnico non inserisce un valore o sceglie uno scenario documentato disponibile.

L’estrazione ricava inoltre scenari di altezza da intervalli espliciti nelle condizioni delle voci volumetriche (ad esempio 5–8 m → scenario 6,5 m). Un limite «fino a 5 m» non diventa arbitrariamente un’altezza media; una luce strutturale non viene confusa con l’altezza. Lo scenario viene sempre scelto esplicitamente, non applicato all’apertura del pannello.

Non viene adottata automaticamente una provincia vicina se manca il prezzario del territorio. La scelta manuale di un documento è possibile, ma è dichiarata come tale. I nomi dei comuni risolti solo con somiglianza approssimativa non vengono accettati automaticamente.

Altezza, luce e superficie non costituiscono un interprete universale di tutte le condizioni testuali: la conversione €/m³ è generale, mentre formule e fasce strutturate sono esplicite per i casi verificati. Se un parametro inserito non viene usato dalla regola, la conferma lo segnala. Gli altri requisiti e correttivi restano leggibili e sotto il controllo del tecnico.

## Garanzie nell’editor

- Nessuna modifica all’apertura del pannello o alla selezione di una variante.
- Nei gruppi viene precompilata soltanto la località condivisa da tutti gli immobili; se diversa o incompleta, il tecnico sceglie il territorio dell’area. I campi ereditati dal primo immobile non diventano automaticamente la località di tutto il PDF combinato.
- Conferma obbligatoria di unità, condizioni, epoca e oneri prima di applicare.
- Se la voce include già gli oneri e l’area ha una maggiorazione attiva, è richiesta conferma per rimuoverla.
- Se l’area ha un totale manuale, è richiesta conferma per rimuoverlo e ricalcolare con il prezzo unitario.
- Applicazione circoscritta a una sola area, annullabile con la normale cronologia.
- Provenienza salvata nel JSON della bozza: ID regola, hash documento, pagina, versione catalogo, epoca della fonte, importo, formula, ipotesi, altezza eventuale, contesto dei filtri e data della scelta.
- Una successiva modifica manuale del prezzo o della destinazione rimuove l’attribuzione automatica al prezzario.

## Copertura e limiti

L’inventario comprende **120 file**, di cui **112 PDF**, **4 XLSX** e **4 TXT**; i PDF unici sono **108**. I duplicati esatti portano a **116 fonti uniche complessive**. La matrice di copertura generata, con conteggi aggiornati per ogni documento, si trova in `docs/analisi-prezzari-copertura.md` ed è consultabile anche nella pagina Prezzari.

Snapshot pubblicato il 19 settembre 2026: **31.349 voci**, **11.273 con secondo controllo superato**, **zero controlli pendenti** e **zero pagine candidate incomplete**. Le 3.635 pagine/blocchi comprendono 3.553 pagine PDF e 82 blocchi dei documenti di supporto. Un controllo superato non elimina le condizioni di applicazione: per esempio il comune o l’altezza possono ancora essere obbligatori.

“Tutti i prezzari coperti” significa che ogni file è inventariato e passato nella pipeline appropriata, con gli eventuali limiti esposti. **Non equivale alla certificazione manuale di ogni cella di ogni tabella.** I documenti senza tariffe, i calcolatori, gli esempi e le voci da riconciliare rimangono visibili ma non vengono forzati in una proposta al m².

La selezione delle pagine candidate usa indicatori di valuta/unità e tabelle numeriche, includendo le continuazioni prive di intestazione. Questo riduce le omissioni ma non dimostra la completezza semantica di tutte le varianti. Un confronto specialistico con Soul rimane necessario prima di promuovere il laboratorio in produzione.

## Riproducibilità

Originali: `00_prezzari2026/`, montati **in sola lettura** nell’API. Non sono incorporati in Git né copiati nel database. Il catalogo derivato versionato è `apps/api/src/price-lists/data/catalog.generated.json`.

La versione del catalogo contiene anche un’impronta del contenuto: due revisioni dell’estrazione non vengono confuse solo perché generate nello stesso giorno. Questa versione viene conservata nella provenienza del prezzo applicato.

Script in `scripts/prezzari/`:

- `extract-sources.mjs`: testo nativo con Poppler, inventario e SHA-256.
- `ocr-sources.mjs`: Tesseract italiano/inglese; riprendibile, con soglia configurabile. Nella seconda passata un testo nativo viene sostituito soltanto quando l’OCR recupera sensibilmente più contenuto.
- `extract-supporting.py`: XLSX/TXT con librerie standard, senza esecuzione di formule.
- `extract-rules.mjs`: estrazione NeuralWatt, cache per contenuto e prompt, frammentazione delle tabelle lunghe, ripresa dopo interruzioni.
- `audit-rules.mjs`: secondo controllo semantico. I risultati sono riutilizzati soltanto se regole e contesto della fonte coincidono.
- `build-catalog.mjs`: normalizzazione, riscontri deterministici, applicazione dei controlli semantici, catalogo e copertura.
- `report-catalog.mjs`: matrice Markdown di copertura, duplicati, unità, destinazioni e limiti residui.
- `refresh-catalog.mjs`: esegue costruzione → audit → ricostruzione; con `PRICE_REFRESH_ROUNDS` ripete il ciclo durante l’estrazione. Un audit incompleto rimane bloccato e riprendibile, senza impedire gli altri controlli. `PRICE_DEADLINE` limita temporalmente l’elaborazione.

Usare `PRICE_CACHE_DIR` per un percorso persistente di cache. Gli script Node di elaborazione vanno eseguiti dalla radice del repository; gli script Poppler/Tesseract possono essere eseguiti nell’immagine API esistente con originali montati in sola lettura. Le credenziali NeuralWatt sono lette dall’ambiente locale e non scritte nei risultati. Limitare la concorrenza complessiva; l’estrazione gestisce ritardi e riprese in caso di rate limit.

La cache di questa analisi è conservata localmente in `.cache/prezzari/` (esclusa da Git e dal contesto Docker), con testo/OCR, risposte strutturate e controlli. Per ricostruire il catalogo dalla cache, senza nuove chiamate LLM: `node scripts/prezzari/build-catalog.mjs`, poi `node scripts/prezzari/report-catalog.mjs`. Eseguire una sola costruzione alla volta. Gli originali e la cache vanno mantenuti per poter riprodurre e revisionare l’analisi; il solo catalogo Git non sostituisce gli originali.

Ordine consigliato: estrazione nativa → OCR → documenti di supporto → estrazione regole → costruzione catalogo → audit → ricostruzione catalogo. Ripetere gli ultimi passaggi per le pagine incomplete o per gli originali modificati. Non è una procedura avviata da richieste web.

## API interne e sicurezza

Tutti gli endpoint sotto `/api/price-rules` richiedono la normale autenticazione Clerk della piattaforma:

- `GET /catalog`: metadati, copertura, province e conteggi.
- `GET /context?province=…&municipality=…`: normalizzazione conservativa del territorio.
- `GET /suggestions`: filtri validati, paginazione, voci, motivi dell’associazione e formule.
- `GET /documents/:sha256/source`: originale autorizzato dal catalogo, percorso verificato e hash controllato prima della risposta.
- `GET /export.csv`: tutte le voci per revisione offline, con protezione dalle formule CSV.

Nessun endpoint pubblico, nessun bypass dell’autenticazione, nessun download di percorsi arbitrari. Non sono richieste migrazioni né reseeding del database. L’API di sync ERP non cambia.

## Verifica e pubblicazione

La validazione comprende test su filtri territoriali, unità, valuta, intervalli, limiti di altezza/luce, voci escluse, input malformati, conversioni, oneri, fonti identificate dall’hash, autenticazione e CSV. I test browser dell’editor utilizzano studi e salvataggi simulati: non alterano gli studi del cliente.

Verifiche eseguite sul laboratorio:

- Suite API completa: **187 test superati**, inclusa la regressione delle presentazioni e dei flussi ERP esistenti.
- Test mirati del motore prezzari: **21 superati** (compresi nella suite API).
- Test degli strumenti di estrazione e controllo: **11 superati**.
- Browser autenticato in staging: **7 test superati** per accesso alle fonti, filtri Milano, formule Lecco/FVG, coefficienti percentuali, layout a 1366/1024/390 px e applicazione nell’editor con salvataggio, provenienza e annullamento.
- Regressioni browser su layout dell’editor e taratura: **2 superate**.

I conteggi dei test verificano il comportamento del software; non equivalgono alla verifica manuale di tutte le tariffe estratte.

Il deploy usa esclusivamente il progetto Compose `soul-pq-staging`, porte 8181/3002/5433, dal worktree della branch `analisi-prezzari`, senza seed. Le immagini di staging precedenti sono conservate per rollback. `main` e il progetto di produzione non vengono aggiornati da questa sperimentazione.
