# Pattern tecnici e criteri di priorità per gli studi Soul

Il seguito su [spazi e raccolta dati](2026-10-15-spazi-e-raccolta-dati.md) estende
il confronto delle geometrie e corregge l'esclusione delle quantità non superficiali:
il campione geometrico passa da 103 a 102 unità dopo il riconoscimento di m³ nei silos.
I risultati documentali e la riconciliazione delle presentazioni qui riportati restano validi.

I dati disponibili permettono già di costruire un primo ordinamento e di individuare
ipotesi tecniche verificabili. Il segnale quantitativo più stabile resta la rendita
attuale; per avvicinarsi alla lavorabilità serve ricostruire il margine rispetto alle
caratteristiche dell'immobile e distinguere quel margine dalla convenienza economica.
La sola presenza di una frase nella visura non basta.

Questo approfondimento usa lo snapshot del 15 ottobre 2026 alle 01:33 UTC della
branch `ordinamento`, già descritto nell'[analisi iniziale](2026-10-15-analisi-iniziale.md).
Integra l'ultimo scambio del thread T3 `f7d68ad3-79a6-4fd5-905c-a9a9cb827e11`,
con risposta finale del 15 ottobre alle 01:05:05 UTC, e una revisione indipendente
dei casi con GPT 6.1 Sol, ragionamento xhigh, `service_tier=default`, CLI 0.162.1.
Gli importi sono proposte o simulazioni di fattibilità, non risparmi conseguiti.

## Il contributo dell'analisi di T3

La riconciliazione delle ultime presentazioni conferma i numeri di T3, assegnando
agli studi corretti anche gli immobili delle presentazioni condivise:

| Indicatore | Risultato |
| --- | ---: |
| Studi positivi con presentazione | 35 su 36 |
| Presentazioni con un solo immobile dello studio | 18 su 35 |
| Presentazioni con uno, due o tre immobili dello studio | 32 su 35 |
| Riduzione mediana della rendita per studio | 32.198,88 € |
| Risparmio IMU annuo mediano proposto per studio | 21.895,63 € |
| Riduzione percentuale mediana della rendita per studio | 15,70% |
| Minimo risparmio IMU annuo proposto fra questi studi | 5.924,07 € |

Un'azienda può quindi essere interessante grazie a un solo immobile. Per ordinare
le aziende conviene considerare le migliori opportunità distinte e il loro beneficio
complessivo, evitando che un grande numero di unità deboli prevalga automaticamente
su una singola opportunità forte. Un subalterno non equivale sempre a un edificio o
a una pratica indipendente.

Il minimo osservato di 5.924,07 € non identifica una soglia commerciale. T3 segnala
anche studi negativi con riduzioni simulate; il caso seguente chiarisce il limite.

## Il negativo con un beneficio simulato elevato

Lo [studio 4651](https://pq.soul.it/studi/4651), immobile 1575689, D/2, ha rendita
804.880 €, proposta 776.101,25 €, differenza 28.778,75 € pari al 3,58%, e beneficio
IMU simulato di 20.819,99 €/anno. La nota del tecnico del 1 ottobre dice:
«I valori attuali sembrano già essere congrui.»

La motivazione disponibile riguarda quindi la congruità. Non documenta una soglia
percentuale rigida. Una base molto grande produce un beneficio assoluto elevato
anche con uno scostamento percentuale piccolo: questo non prova un errore catastale
sostenibile in una pratica. `currentImu=0` nel record non attesta l'imposta pagata;
gli importi sono da leggere come simulazione, non come differenza fra versamenti.

Il confronto con lo [studio 4618](https://pq.soul.it/studi/4618), immobile 1571680,
è istruttivo: anch'esso D/2, positivo con proposta 140.937,40 → 105.600 € e beneficio
IMU 18.329,51 €/anno, inferiore al negativo 4651. La nota specifica «Valutazione a
camera dopo aver visto hotel confinante», con superfici ancora da approfondire.
La bozza usa 44 camere; nel 4651 compare una quantità di 294 camere. Non sono m².
Il confronto corretto richiede unità funzionali e parametri coerenti per tipologia.

## Rendita rispetto alla superficie e controesempi

Sono state raccolte tutte le coppie disponibili con esiti opposti, stessa categoria,
stesso studio, geometria utilizzabile e rendite entro un fattore 1,5: sei coppie in
cinque studi, due nello stesso comune. Sono illustrazioni basate su misure del tecnico,
non una validazione dell'estrazione automatica dai documenti.

Nello [studio 4630](https://pq.soul.it/studi/4630), due D/1 a Sessa Aurunca mostrano:

| Immobile | Esito | Rendita | Coperto annotato | Rendita per m² coperto |
| --- | --- | ---: | ---: | ---: |
| 1572344 | Positivo | 56.697 € | 5.679 m² | 9,98 €/m² |
| 1572349 | Negativo | 46.275,20 € | 11.369 m² | 4,07 €/m² |

La rendita vicina insiste su superfici molto diverse. Questa è un'ipotesi tecnica
utile: cercare una rendita elevata rispetto a dimensioni, uso, localizzazione e
caratteristiche comparabili. Le tariffe adottate dal tecnico differiscono anche qui
(220 e 180 €/m² per il capannone): il rapporto semplice non riproduce tutta la stima.

Un controesempio nello [studio 4633](https://pq.soul.it/studi/4633) mostra il limite:
i D/1 1573262, positivo, e 1573203, negativo, hanno rispettivamente circa 4,748 e
4,739 €/m². Sono quasi uguali. Cambiano localizzazione, composizione e valori unitari:
nel primo il capannone è valutato 150 €/m², nel secondo 200 €/m² e gli uffici 360 €/m².
Perciò una soglia nazionale di rendita/m² non sarebbe sufficiente.

### Un errore di scala può creare un falso risparmio

L'ispezione visiva dei due elaborati dello studio 4630 conferma che contengono più
subalterni; bisogna riconoscere il sub interessato e separare coperto, piazzali e piani.
Per l'immobile 1572349 l'elaborato originale reca scala 1:1000, ma è acquisito A3 e
stampato A4; il documento avverte «Fattore di scala non utilizzabile». Il tecnico ha
registrato una calibrazione 1:1538 sul PDF.

Mantenendo le selezioni e gli altri parametri della bozza e sostituendo 1538 con
1000, le superfici diventerebbero il 42,3% di quelle attualmente calcolate. In questo
caso, con terreno stimato in percentuale, la rendita proposta passerebbe da circa
53.992 € a 22.826 €: apparirebbe una riduzione del 50,7% rispetto ai 46.275 € attuali.
È una simulazione dell'effetto della scala, non una nuova valutazione dell'immobile.
Non certifica la misura del tecnico, ma dimostra perché leggere correttamente la
scritta «1:1000» non basta a misurare il PDF.

Per il batch occorre conservare scala dichiarata, formato originale e PDF, eventuali
quote o riferimenti di calibrazione, subalterni e piani coperti, e un indicatore di
affidabilità. Un beneficio che scompare entro l'incertezza dimensionale richiede verifica.

## Quali segnali delle visure resistono al confronto

Il confronto usa solo unità con esito esplicito e stato corrente della visura
leggibile per tutti i membri: 140 unità, 43 positive, 55 studi, 49 gruppi indipendenti
secondo i collegamenti disponibili. Le altre 23 unità etichettate sono escluse da
questo confronto; documento mancante non significa indicatore assente.

| Indicatore | Positivi con indicatore | Positivi senza indicatore | Interpretazione |
| --- | ---: | ---: | --- |
| Rendita rettificata nello stato corrente | 3/26 | 40/114 | Associazione negativa, incremento predittivo non dimostrato |
| Rideterminazione ex comma 22 nello storico | 4/13 | 39/127 | Circa 31% in entrambi i gruppi; non separa gli esiti |
| Menzione di ruralità | 0/5 | 43/135 | Cinque unità, ma soltanto due gruppi collegati indipendenti |
| Menzione di contenzioso nello storico | 3/12 | 40/128 | Campione piccolo e stato del contenzioso da ricostruire |

Per la rettifica, l'associazione permane descrittivamente stratificando per categoria
e fasce di rendita (odds ratio Mantel–Haenszel circa 0,28). Questo non dimostra un
effetto causale o una capacità predittiva aggiuntiva: gli strati sono piccoli e il
campione è selezionato.

Il controllo predittivo mantiene aziende e immobili collegati nello stesso gruppo:
5 partizioni, 10 ripetizioni, medesime fasce di rendita e regolarizzazione per tutti
i confronti. AUC indica la capacità di ordinare gli esiti, non una percentuale di
accuratezza; la selezione del primo 20% tratta i punteggi pari senza favorire gli esiti.

| Modello esplorativo sul medesimo campione | AUC media | Positivi nel primo 20% |
| --- | ---: | ---: |
| Rendita | 0,750 | 57,7% |
| Rendita e rettifica corrente | 0,749 | 59,0% |
| Rendita e categoria | 0,727 | 60,7% |
| Rendita, categoria e rettifica | 0,697 | 57,4% |

La rettifica non fornisce un miglioramento convincente con questi modelli. Sui soli
studi creati nel 2026, 97 unità, l'AUC passa da 0,764 a 0,750 aggiungendola alla rendita.
È una verifica di sensibilità per anno d'origine dello studio, non una validazione
temporale. Le ipotesi sono state scelte osservando lo stesso campione: questi numeri
restano esplorativi e non sono probabilità calibrate sui 50.000 immobili futuri.

### La sequenza degli atti è più utile della parola isolata

- Nello [studio 622](https://pq.soul.it/studi/622), negativo, la visura dell'immobile
  1576768 ricostruisce una rendita di 227.529 €, scesa a 147.812 € dopo la revisione
  del 2016 e poi salita a 153.088,90 € dopo ampliamento. La bozza attuale stima
  156.799,39 €. La riduzione storica è già incorporata nella base di confronto.
- Nello [studio 4661](https://pq.soul.it/studi/4661), negativo, le categorie D/1 e
  D/7 non esplicitano la ruralità. La visura documenta l'annullamento del precedente
  diniego e il ripristino dell'annotazione. Una ricerca per sole categorie o per la
  parola «contenzioso» perderebbe il senso della sequenza.
- Nello [studio 4635](https://pq.soul.it/studi/4635), positivo, il tecnico valuta
  insieme tre sub e annota un precedente tentativo rettificato. La presentazione
  riconcilia rendita complessiva 198.268,88 €, proposta 166.070 € e beneficio IMU
  23.293,71 €/anno. Un precedente tentativo non riuscito non implica esclusione.
- Nello [studio 4631](https://pq.soul.it/studi/4631), gli immobili 1571811, 1571812 e
  1571814 sono sospesi per vicende di classamento. Le annotazioni vanno interpretate
  con lo stato attuale della controversia; questi casi non sono esempi negativi.

Nel 4651 e nel positivo 4618 compaiono anche annotazioni di rendita «validata»:
nemmeno questa parola costituisce una regola di esclusione. L'estrazione attuale
per blocchi di stato non ricostruisce ancora completamente annotazioni successive,
atti, annullamenti e rapporti fra vecchi e nuovi subalterni.

## Procedura per sviluppare l'ordinamento

1. **Ricostruire l'unità da valutare e il motivo dell'esito.** Collegare azienda,
   edificio, sub e pratica; separare congruità, margine economico insufficiente,
   trattamento fiscale, contenzioso, incompletezza e indisponibilità commerciale.
   Le note storiche servono a ricostruire queste etichette; non entrano fra gli
   input del modello che dovrà classificare immobili nuovi. Le quote dei singoli
   membri non sostituiscono la stima di un gruppo.
2. **Estrarre fatti verificabili dai documenti.** Per ogni fatto salvare fonte,
   pagina, data di validità, valore e affidabilità. Dalle visure: rendite e causali
   nel tempo, rettifiche, revisioni precedenti, ruralità, fusioni, soppressioni e
   destinazioni. Dai disegni: sub e piani, superfici per uso, parti comuni, scala
   e completezza. Per alberghi separare camere da superfici.
3. **Ricostruire una fascia di rendita plausibile.** Confrontare immobili omogenei
   e una stima coerente con i parametri tecnici applicabili. Usare intervalli per
   superfici e costi incerti. L'ipotesi centrale diventa lo scostamento della rendita
   corrente dalla fascia plausibile, verificando se resta un margine anche con
   assunzioni prudenti. Questa ricostruzione va prodotta dai documenti grezzi senza
   vedere proposta, geometrie manuali o esito storico.
4. **Verificare il valore aggiunto di ogni famiglia di indicatori.** Confrontare
   rendita sola, storia catastale, geometria e stima ricostruita sullo stesso campione,
   mantenendo ogni azienda e i suoi immobili collegati nella medesima partizione.
   Il lavoro già svolto fornisce casi e misure di riferimento per verificare
   l'estrattore; non consente di valutare l'estrattore usando direttamente le misure
   manuali come se fossero prodotte in automatico.
5. **Misurare il risultato su casi nuovi.** Congelare input e graduatoria prima della
   valutazione, includere un campione casuale oltre ai primi classificati e registrare
   positivi trovati per ora di lavoro, errori nella selezione e margini confermati.
   La nota dello studio 4633 mostra già una selezione storica «sopra 20k €»: gli
   immobili esaminati non rappresentano casualmente il futuro universo nazionale.

L'output dovrebbe esporre separatamente priorità tecnica, beneficio annuo plausibile,
qualità dei dati, ostacoli e motivo della posizione. Quando le probabilità saranno
calibrate, la priorità economica potrà usare il valore atteso per Soul: probabilità
congiunta di successo tecnico e commerciale, compenso atteso e costi di acquisizione
e lavorazione. Il risparmio IMU del cliente non coincide con il guadagno di Soul.
Le probabilità degli immobili della stessa azienda non vanno considerate indipendenti.

La prima attività consigliata è un esperimento sui documenti già presenti: estrazione
senza conoscere l'esito su D/1, D/7 e D/8, confronto delle superfici con le annotazioni
del tecnico, analisi degli errori di scala e subalterno, poi misura del miglioramento
rispetto alla sola rendita. Questo rende concreto il passaggio ai grandi batch senza
attendere l'acquisizione di tutti i 50.000 immobili.

## Riproducibilità

Eseguire `python3 scripts/ordinamento/refine_patterns.py` dopo le estrazioni descritte
nel [README](README.md). Gli output nominativi restano in `.research/`:
`refined-findings.json`, `refined-cv-*.csv`, `comparable-geometry-pairs.csv` e
`t3-study-presentations.csv`. L'ispezione visiva usa due immagini locali in
`plan-review/`, ottenute dai PDF del manifest senza modificare gli originali.

Le cifre dei gruppi vanno lette in `positive-unit-proposals.csv`, abbinate esattamente
ai membri della presentazione. `evaluated-units.csv` lascia vuoti i campi economici
di proposta dei gruppi, evitando di ereditare per errore la quota del primo membro.
La suite comprende 10 controlli, inclusa la verifica che cambiare gli esiti esclusi
dall'addestramento non possa cambiare le predizioni della loro stessa partizione.
