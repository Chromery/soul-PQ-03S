# Ordinamento degli immobili: prima analisi del 15 ottobre 2026

## Risultato e scelta del repository

Ci sono segnali utili per un ordinamento preliminare: rendita attuale, rendita rapportata
alle superfici effettive, annotazioni di rettifica nello stato catastale corrente,
ruralità e storia delle precedenti rideterminazioni. Il campione permette una prima
ricerca verificabile, ma non una probabilità attendibile per tutti gli immobili italiani.

Per questa fase è preferibile la branch `ordinamento` nello stesso repository,
con worktree e dati isolati. Il patrimonio riutilizzabile comprende schema immobili,
gruppi di valutazione, acquisizione documenti, estrazione visure, geometrie, prezzari,
calcoli IMU e presentazioni. Un repository autonomo diventerebbe utile quando il motore
batch avrà distribuzione, dipendenze o team propri: nel frattempo conviene mantenerlo
come modulo separato e senza dipendenze operative dal frontend.

## Origine, campione e significato degli esiti

Snapshot consistente della produzione attuale, iniziato il **15/10/2026 alle 01:33:37 UTC**
e ripristinato localmente alle 01:33:51 UTC. Il dump verificato misura 11.593.613 byte.
SHA-256: `5f2f1b378f6d8653de56ced0ea12a8df7544d6649f6bc7875eb618fa44a63796`.
L'analisi esclude i 78 studi archiviati; la copia completa del DB li conserva soltanto
per integrità e riproducibilità. Produzione e staging non sono stati modificati.

| Livello | Positivi | Negativi | Sospesi | Neutri | Totale |
| --- | ---: | ---: | ---: | ---: | ---: |
| Studi non archiviati | 36 | 26 | 6 | — | 68 |
| Immobili nei medesimi studi | 73 | 103 | 29 | 1.917 | 2.122 |
| Unità di valutazione con esito positivo/negativo, dopo aggregazione dei gruppi | 63 | 100 | esclusi | esclusi | 163 |

I 73 immobili positivi appartengono a 34 studi; 72 sono in studi positivi e uno in uno
studio sospeso. Tre studi positivi non hanno immobili attualmente etichettati positivi:
sono casi da riconciliare, non da convertire automaticamente in etichette degli immobili.

Il target osservato è **la fattibilità attribuita dal tecnico**. Non risultano qui
etichette strutturate sufficienti per provare accettazione della revisione catastale,
risparmio realizzato, conversione commerciale o margine Soul. Occorreranno target distinti.

I record coprono studi originati dal 2019 al 2026, spesso successivamente aggiornati.
Il tecnico ha selezionato immobili e aziende: le note citano analisi dei maggiori asset,
soglie di 20.000/45.000 euro e aggiornamenti di vecchi positivi. La prevalenza dei positivi
nel campione non è quella della popolazione nazionale.

## 1. Rendita elevata: il segnale più semplice che regge ai controlli

Le seguenti percentuali sono frequenze **nel campione selezionato**, non probabilità
applicabili direttamente a nuovi immobili. L'unità è il singolo immobile o il gruppo
valutato insieme; gli intervalli ricampionano studi/gruppi collegati.

| Rendita attuale dell'unità | Positivi / valutati | Frequenza positiva | Intervallo bootstrap 95%, circa |
| --- | ---: | ---: | ---: |
| Meno di 20.000 € | 3 / 32 | 9% | 0–21% |
| 20.000–49.999 € | 15 / 52 | 29% | 13–44% |
| 50.000–99.999 € | 11 / 26 | 42% | 24–61% |
| Almeno 100.000 € | 34 / 53 | 64% | 48–79% |

Il risultato non dipende soltanto dai vecchi positivi: limitando agli studi originati
nel 2026, si osservano rispettivamente **2/29, 5/30, 4/13 e 16/27** positivi.
L'anno di origine dello studio non è una divisione temporale rigorosa delle valutazioni.

Nei 18 studi che contengono sia unità positive sia negative, la rendita ordina in media
meglio del caso (AUC media interna allo studio 0,69). Sull'intero campione l'AUC descrittiva
è 0,75, con intervallo bootstrap per gruppi circa 0,66–0,83. Questo sostiene l'utilità
del segnale, ma non dimostra che una rendita alta sia errata: può anche riflettere
dimensione, valore del bene e soglia economica minima del servizio.

La sola categoria catastale generalizza poco in questo campione. Per esempio D/1
presenta 24 positivi su 55 unità, D/7 21/50, D/8 8/22, D/2 3/15. Le differenze sono
incerte e dipendono anche dai gruppi aziendali osservati. Non userei una whitelist rigida
di categorie appresa da questi conteggi.

## 2. Le visure contengono indicatori concreti

Sono stati copiati 433 allegati già disponibili: **184 visure, 124 planimetrie e 125
elenchi subalterni**, equivalenti a 369 file distinti. Tutte le 184 visure hanno un text
layer leggibile e un primo stato catastale individuabile. Gli indicatori conservano
pagina, hash del documento e frammento di evidenza, così da poter essere controllati.

| Indicatore | Evidenza osservata | Come usarlo |
| --- | --- | --- |
| “Classamento e rendita rettificati” nello stato corrente | 26 unità con esito noto: **3 positive e 23 negative**. Tra le altre unità con visura: 41 positive su 116 | Segnale di priorità potenzialmente minore; controllare data, causale e provvedimento, senza esclusione automatica |
| Ruralità nelle annotazioni attuali o storiche | **5 immobili, tutti negativi**, in 3 studi; categorie D/1 e D/7. Quattro hanno il riferimento nel primo stato, uno soltanto nello storico | Verificare il trattamento fiscale effettivo anche fuori dalla D/10; una menzione storica non prova lo stato attuale |
| Rideterminazione ex art. 1, comma 22, L. 208/15 | 18 immobili: 5 positivi, 9 negativi, 4 sospesi; 17 unità dopo aggregazione, con 4 positive | Ricostruire quanto sia già stato scorporato: un intervento precedente non esaurisce necessariamente il margine |
| Contenzioso/ricorso/sentenza nel documento | 16 immobili: 3 positivi, 9 negativi, 3 sospesi, 1 neutro | Gestire separatamente tempi, stato della pratica e probabilità di conclusione |
| Rendita proposta in qualsiasi pagina | 179/184 visure | Quasi inutile se cercata indiscriminatamente nello storico; il solo stato corrente riduce i casi a 30 |

La rettifica corrente è il segnale documentale più interessante emerso. I 26 casi con
esito noto sono distribuiti in 17 studi. Fra quelli con stato corrente datato dal 2021,
nessuna delle 14 unità osservate è positiva; il numero è piccolo e l'interazione è stata
scoperta esplorando gli stessi dati, quindi va verificata su nuovi casi prima dell'uso.
La data del primo stato non coincide necessariamente con la data dell'ultima stima.

L'estrattore distingue **“rettificati” da “non rettificati”** e primo stato da storico.
Il testo “ruralità” può comparire in dinieghi, annullamenti o vecchi provvedimenti:
la presenza della parola è un segnale per leggere l'atto, non una decisione fiscale.

Il controllo degli scorpori ha un fondamento documentale specifico: la circolare 2/E
del 2016 distingue componenti immobiliari da impianti funzionali al processo produttivo
e descrive la rideterminazione prevista dal comma 22. Non tutti gli impianti sono esclusi;
assenza della causale nella visura non dimostra che siano ancora computati nella rendita.
[Fonte: circolare Agenzia delle Entrate 2/E del 2016](https://def.finanze.it/DocTribFrontend/getContent.do?id=%7B053FACAF-690A-4569-BD2E-CDFA390CCA97%7D).

## 3. Rendita per superficie: promettente, ma oggi dipende ancora dal tecnico

Dalle bozze esistenti ho ricostruito le superfici usando scala per pagina, taratura,
selezioni e override manuali, separando esterni e coperto. La somma riprodotta coincide
con quella salvata, entro l'errore numerico di floating point.

Limitando a D/1, D/7 e D/8, escludendo geometrie con oltre il 10% di usi personalizzati
e possibili quantità espresse in unità diverse dai metri quadrati:

| Rendita per superficie coperta annotata | Positivi | Negativi |
| --- | ---: | ---: |
| Unità utilizzabili | 36 | 67 |
| Mediana | **9,01 €/m²** | **5,27 €/m²** |

L'associazione descrittiva è interessante (AUC 0,80), ma **queste superfici sono state
annotate durante la valutazione**: non le ho usate come input nella verifica predittiva.
Prima occorre ottenerle automaticamente da documenti precedenti all'esito, verificarne
completezza, unità di misura e scala, e confrontare immobili realmente omogenei.

Ho trovato casi in cui il campo di area contiene il numero di camere dell'hotel,
valutate a camera. Senza controllare l'unità di misura emergerebbero falsi valori di
migliaia di euro di rendita al metro quadrato. Inoltre 37 bozze individuali non aggregate
usano almeno una scala diversa di oltre il 10% da quella proposta dall'AI: la differenza
non prova un errore dell'AI, ma impedisce di assumere la scala stampata come misura fisica
senza verificare ridimensionamento e taratura.

La circolare 6/T del 2012 descrive stima diretta e procedimenti indiretti, anche a partire
dal costo di ricostruzione con deprezzamento. Il rapporto €/m² è dunque un indicatore
comparativo di ricerca, non un sostituto della stima e non una soglia nazionale universale.
[Fonte: circolare Agenzia del Territorio 6/T del 2012](https://www1.agenziaentrate.gov.it/mt/circolari/circolare_6_2012.pdf).

## 4. Unità di analisi e obiettivo economico

Cinque C/6 positivi appartengono a un'unica valutazione. La presentazione aggregata
riporta rendita attuale e proposta entrambe pari a **14.493,33 €**, ma IMU proposta in
riduzione di **16.115,86 €/anno**. È una simulazione del tecnico relativa al gruppo;
non prova che la modifica sia stata accettata. Dimostra però che il target “positivo”
comprende anche opportunità che non sono semplicemente diminuzioni della rendita.

Ho riconciliato tutte le **63 unità positive** con le ultime presentazioni salvate,
usando gli esatti identificativi dei membri. Le proposte mostrano una riduzione IMU annua
mediana di **12.460,70 €**, tra 3.013,92 e 216.072,85 euro. La riduzione percentuale mediana
della rendita è 16,61%. Sono **stime selezionate di fattibilità**, non risparmi realizzati,
non tariffe Soul e non una previsione per gli immobili ancora da valutare.

Le proposte possono risiedere nelle bozze dell'editor, negli override delle presentazioni
o nelle righe aggregate. Non è corretto addestrare direttamente sui soli campi
`estimatedRendita`, `diffRendita` o `diffImu` senza ricostruire precedenze e gruppi:
uno zero può indicare una proposta mancante o una quota contabilizzata su un altro membro.

Altre correzioni necessarie: 562 categorie hanno prefissi come `ZONA2CAT.D/1`; vanno
separate categoria e zona censuaria. Sono presenti 3 chiavi catastali ripetute fra studi:
le abbiamo unite nei gruppi di validazione, ma l'ordinamento commerciale dovrà anche
evitare di proporre due volte lo stesso bene e verificare quota e diritto del soggetto.

## 5. Quanto funziona una baseline semplice?

Ho verificato modelli esplorativi basati su fasce di rendita, categoria e combinazione
delle due. Confronto su 5 fold ripetuti 10 volte, sempre separando aziende/studi collegati,
asset catastali condivisi e un gruppo societario verificato nelle note. Dopo questi
raggruppamenti il portafoglio contiene 61 componenti. Eventuali legami non documentati
restano una limitazione.

| Modello | AUC media sui fold esclusi | Brier, più basso è meglio | Positivi nella prima fascia del 20% dei fold |
| --- | ---: | ---: | ---: |
| Frequenza positiva del campione di addestramento | 0,50 | 0,245 | 39% |
| Fasce di rendita | **0,74** | **0,211** | **63%** |
| Sola categoria | 0,44 | 0,254 | 29% |
| Fasce di rendita + categoria | 0,73 | 0,212 | 68% |

Nel sottocampione di studi originati nel 2026: AUC circa 0,77 per rendita e 0,79 per
combinazione; positivi nella prima fascia rispettivamente 52% e 53%, contro circa 27%
del campione. La combinazione non migliora uniformemente tutti i criteri: non c'è
evidenza per proclamare un modello vincitore definitivo.

Le soglie sono 20/50/100 mila euro; la stima delle frequenze è regolarizzata con
pseudoconteggio 10. Le scelte sono esplorative sul medesimo dataset. I pareggi nella
prima fascia sono pesati, non sciolti usando gli esiti. L'AUC si calcola entro ogni
fold; aggregare ranghi leave-one-out sarebbe fuorviante con frequenze discrete.

Nessuna nota, proposta del tecnico, geometria manuale, presenza documentale o
`hasStudy` entra in questi modelli. Per esempio le visure sono presenti per 100/103
negativi ma solo 49/73 positivi: usare la loro disponibilità produrrebbe soprattutto
un indicatore del processo e dell'età degli studi. Gli indicatori documentali sono
per ora associazioni descrittive, non una validazione di un classificatore documentale.

Anche rendita e categoria sono i valori correnti nel DB: senza una fotografia degli
input all'ingresso non è garantito che ogni valore preceda la valutazione. Il prossimo
pilot deve conservare esplicitamente quella fotografia per eliminare questo rischio.

Questa prova sostiene l'utilità di ordinare i casi rispetto a elaborarli a caso.
Non misura ancora precisione, calibrazione e rendimento sui 50.000 immobili futuri.

## 6. Proposta per un ordinamento più accurato

**Separare tre risultati.** Per ogni complesso: probabilità di fattibilità tecnica,
distribuzione del risparmio fiscale condizionata alla fattibilità e valore commerciale
atteso per Soul. Accettazione della revisione e conversione in contratto richiedono
etichette ulteriori rispetto all'esito attuale dello studio.

**Usare una valutazione tecnica semplificata insieme ai pattern.** Stimare un intervallo
di rendita coerente con componenti, uso, consistenza, territorio, epoca e qualità dei
documenti. Ordinare per scostamento rispetto alla rendita attuale e per beneficio
fiscale stimato, con motivazioni e fonti. I prezzari e le regole già nel progetto sono
una base da validare per questo scopo. Servono riferimenti coerenti con l'epoca censuaria:
il prezzo immobiliare contemporaneo non si converte automaticamente in rendita catastale.

**Aggiungere gli indicatori mancanti.** Storico delle rendite e delle causali, proposte
e rettifiche, ruralità attuale, impianti e scorpori, titolarità e quote, destinazioni
effettive, superfici per uso, piani e altezze quando leggibili, strutture particolari,
composizione del complesso e controversie. ATECO e fonti aziendali possono fornire
contesto, ma l'attività dell'impresa non dimostra l'uso o la proprietà di ogni immobile.
Ogni dato estratto deve avere documento/pagina, data, confidenza e stato di verifica.

**Registrare il perché degli esiti.** Aggiungere motivi strutturati: rendita congrua,
margine insufficiente, ruralità/agevolazioni, precedente scorporo, categoria/uso,
documenti insufficienti, superfici incerte, contenzioso, esclusione commerciale.
Le note del tecnico sono utili per costruire questa tassonomia; non sono input
predittivi disponibili per un nuovo caso. Valorizzare il tecnico come revisore dei
casi incerti e delle regole permette di ridurre il collo di bottiglia gradualmente.

**Costruire un campione nuovo e rappresentativo.** Pilotare, per esempio, su 300–500
unità campionate per rendita, categoria, territorio e disponibilità documentale,
con una quota casuale anche nelle fasce basse. È una proposta di dimensione iniziale,
da affinare sulla capacità di revisione e sulla precisione desiderata. Riesaminare
una parte con un secondo tecnico, registrare i disaccordi e congelare gli input prima
della valutazione. Mantenere un test futuro mai usato per scegliere regole o soglie.

**Misurare il risultato che interessa a Soul.** Precisione nei primi K posti (K pari
alla capacità commerciale/tecnica), risparmio e margine confermati per ora di lavoro,
costo documentale per positivo, copertura, falsi negativi stimati dal campione casuale,
calibrazione delle probabilità per segmento. Un 20% esplorativo della coda può essere
riservato a casi incerti o sottorappresentati; la quota va scelta operativamente, non
considerata una regola statistica universale.

**Ordinare per utilità attesa.** Per una prima funzione di priorità commerciale:

`E[ricavo Soul condizionato a esito tecnico e conversione] − E[costi documenti, analisi e pratica]`

Esplicitare dipendenze fra fattibilità, accettazione e conversione; non moltiplicare
probabilità marginali assumendole indipendenti. Una seconda vista può ordinare per
utilità attesa per ora tecnica. Il risparmio fiscale del cliente, la riduzione della
rendita e il fatturato Soul devono restare valori distinti. Tariffe, soglie minime,
orizzonte temporale, capacità operativa e motivi di esclusione sono dati da concordare.
Nel campione esiste anche uno studio positivo con una nota di esclusione commerciale:
la sola fattibilità non basta per attivare il commerciale.

## 7. Preparare il batch senza acquisire tutto alla cieca

1. Definire il perimetro delle circa 50.000 unità, la fonte del censimento e i criteri
   di esclusione: quel numero non va assunto come censimento di tutte le aziende italiane.
2. Acquisire anagrafica, identificativi, titolarità, categoria e rendita; normalizzare
   zone e comuni, deduplicare beni, diritti e aziende, ricostruire i complessi.
3. Estrarre visure e storico per le variabili fiscali e documentali. Distinguere sempre
   valore mancante, assenza verificata e informazione storica.
4. Approfondire i candidati con planimetrie, elaborati e fonti pertinenti, seguendo
   disponibilità e titoli di accesso. L'accesso alle planimetrie richiede una gestione
   specifica degli aventi diritto/deleghe: non è una disponibilità da dare per scontata
   per tutte le aziende. [Fonte: modello ufficiale di delega 12T](https://www1.agenziaentrate.gov.it/mt/Generica_nuova/12%20T%2011022014.pdf).
5. Eseguire estrazioni versionate, controlli dimensionali e scoring; salvare prove,
   confidenza, costi e motivi. Gestire retry, checkpoint e deduplicazione per hash.
6. Consegnare al tecnico/commerciale una coda spiegabile con stato di ammissibilità,
   probabilità quando calibrata, beneficio stimato e prossima verifica necessaria.

Per l'acquisizione si può usare una prima graduatoria economica poco costosa e comprare
o elaborare documenti aggiuntivi dove hanno maggior valore informativo. Affiancare un
campione casuale evita di perpetuare la selezione attuale dei soli asset più grandi.

## Consegne e verifiche

Codice riproducibile in `scripts/ordinamento/`, database e allegati isolati, CSV analitici,
indicatori di visura con evidenze, audit delle proposte economiche e una prima coda di
599 immobili neutri D esclusa D/10 ordinati per rendita. Solo 11 di questi 599 hanno
già una visura collegata: la coda serve a organizzare l'acquisizione, non a proclamare
nuovi positivi. Non contiene probabilità o risparmi inventati.

Verificati ripristino del dump, integrità degli allegati, assenza di rete/porte del DB,
esclusione degli archiviati, corrispondenza delle superfici salvate e aggregazione delle
presentazioni. Otto test mirati coprono etichette, categorie, importi, tarature, stime
mancanti, unità di misura, AUC con pareggi e distinzione fra stato attuale/storico/negazioni.

L'analisi è stata eseguita direttamente, senza subagent: il modello richiesto
“sol 6.1 Extra High, standard” non era selezionabile in questa sessione.
