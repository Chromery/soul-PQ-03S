# Composizione degli spazi e dati da raccogliere in PQ

La superficie rapportata alla rendita rimane il segnale tecnico più consistente
fra quelli esaminati. Tettoie, aree esterne, interrati e uso prevalente sono candidati
da approfondire; gli uffici non mostrano un'associazione abbastanza stabile per
attribuire loro un premio automatico nell'ordinamento. La lettura dei singoli casi
mostra che occorre prima distinguere la destinazione fisica dalla voce utilizzata
dal tecnico per calcolare il valore.

L'analisi usa lo stesso snapshot del 15 ottobre 2026 dei rapporti precedenti. La
[proposta di raccolta dati](dati-da-raccogliere-in-pq.md) traduce le lacune osservate
in informazioni da registrare durante l'utilizzo di PQ. Non sono state applicate
modifiche allo schema o ai dati operativi.

## Campione e correzione delle unità di misura

Il confronto quantitativo riguarda 102 unità con esito esplicito, 35 positive e 67
negative, appartenenti a 39 studi e 38 gruppi collegati. Le categorie sono D/1,
D/7 e D/8; servono coperto misurabile, quota custom inferiore al 10% e nessun indizio
di quantità non superficiali. I neutri e i sospesi non entrano fra i negativi.

Il controllo precedente comprendeva 103 unità. L'audit semantico ha rilevato nel
1571584 quantità denominate «silos mc ipotetici», sommate alle superfici. La tariffa
di 40 per unità non attivava il controllo precedente sui prezzi superiori a 2.000.
Il filtro ora riconosce anche diciture esplicite di m³, camere e posti; l'unità è
esclusa dal confronto delle composizioni. Sono ricalcolati gli output di ricerca,
senza modificare le misure o gli esiti nel database.

È un miglioramento prudenziale, non una soluzione completa: senza unità esplicite
nel DB alcune quantità rimangono ambigue. «Custom» non significa sempre sconosciuto:
può essere un ospedale, un piano, verde o una grandezza non superficiale. Il coperto
analitico di questi script esclude tettoie e custom, e non equivale a ogni superficie
fisicamente sotto copertura.

## Associazioni osservate per tipo di spazio

Le presenze e le superfici derivano dalle annotazioni del tecnico. L'assenza di
un'annotazione non dimostra l'assenza fisica dello spazio.

| Caratteristica annotata | Positivi con caratteristica | Positivi senza | Lettura prudente |
| --- | ---: | ---: | --- |
| Tettoie | 5/7, 71% | 30/95, 32% | Candidato interessante ma soltanto 6 studi |
| Aree esterne almeno metà del totale annotato | 19/47, 40% | 16/55, 29% | Possibile indicatore della composizione; dipende anche da rendita e perimetro |
| Interrato o parcheggio interrato | 8/19, 42% | 27/83, 33% | Destinazione effettiva e struttura da distinguere dal solo piano |
| Uffici | 20/48, 42% | 15/54, 28% | Associazione instabile nelle verifiche di sensibilità |
| Almeno metà del coperto classificato capannone | 31/81, 38% | 4/21, 19% | Separa tipi funzionali, non dimostra un effetto del capannone |

Commerciale (0 positivi su 4) e verde (2 su 2) hanno campioni troppo piccoli per
concludere. Non sono regole di esclusione o inclusione.

### Tettoie e grandi superfici a basso valore unitario

Nello [studio 2537](https://pq.soul.it/studi/2537), l'immobile 1574834, positivo,
comprende circa 2.421 m² di capannone e 1.526 m² di tettoie. Le tariffe annotate sono
230 e 50 €/m². L'ipotesi da verificare sulla stima catastale originaria è se la
composizione di superfici con valori molto differenti sia stata rappresentata in
modo coerente. La sola presenza della tettoia non dimostra che sia stata sovrastimata.

Esistono controesempi negativi: 1574052, studio 4624, e 1575950, studio 4653, hanno
tettoie nelle valutazioni. Le loro tariffe sono rispettivamente 60 e 50 €/m². Il
campione di sette unità include due positivi dello stesso studio, quindi non sono
sette osservazioni indipendenti.

Nei positivi, la quota mediana di area esterna supera metà delle quantità annotate,
mentre la sua quota mediana del valore base è circa un decimo. Area e contributo
al valore sono quindi grandezze diverse. Terreno e oneri sono componenti aggiuntive:
non sono contenuti in quella quota del valore base.

### Uffici e interrati non hanno un effetto uniforme

La presenza di uffici sembra favorevole nel confronto aggregato. Tuttavia nella
fascia di rendita 20–50 mila euro risultano positivi 1/9 immobili con uffici e 8/30
senza. Limitandosi alle 59 unità con almeno il 90% delle quantità ricavate dalla
geometria del documento, i positivi sono 6/25 con uffici e 10/34 senza. Questi
sottocampioni non sono confronti causali; mostrano che la regola «uffici = maggiore
lavorabilità» non è stabile.

Le etichette possono anche avere significati impropri: nel D/2 1575689, escluso da
questo campione, una vasta area denominata «uffici» è usata insieme a una valutazione
per camere. L'elenco dei sub descrive un albergo. Serve distinguere la funzione
documentata dalla voce di calcolo scelta nell'editor.

Analogamente, la tariffa dell'interrato coincide con quella del capannone nel
1563792, mentre differisce nel 1571584. Il solo piano non spiega il valore. L'uso
può essere produttivo, accessorio, autorimessa o altro.

### Categoria catastale e uso fisico devono restare separati

Fra i 20 D/8 del campione, cinque hanno prevalenza di capannone e quindici no; i
positivi sono rispettivamente tre e tre. I numeri sono piccoli, ma la differenza
di composizione spiega perché una categoria unica possa mescolare casi molto diversi.

Il D/8 1572519 è un'autorimessa su più livelli, non un generico spazio commerciale.
Il positivo è valutato con 250 €/m²; il negativo D/8 1576434 usa 700 €/m². I prezzi
sono scelte nelle rispettive bozze e vanno ricondotti alle caratteristiche e fonti
pertinenti, non assunti come valori corretti per qualsiasi autorimessa.

## Quanto migliora l'ordinamento

Modelli logistici semplici con penalizzazione fissa, normalizzazione appresa soltanto
sui dati di addestramento, cinque partizioni per gruppo e dieci ripetizioni. Le
caratteristiche considerate sono rendita, categoria, coperto, quota uffici, rapporto
esterni/coperto, quota interrati e rapporto tettoie/coperto. Non entrano prezzi,
risparmi proposti, componenti della stima, motivazioni o esiti del tecnico fra gli input.

| Input sul medesimo campione di 102 unità | AUC media | Positivi nel primo 20% |
| --- | ---: | ---: |
| Rendita | 0,758 | 65,0% |
| Rendita e categoria | 0,728 | 64,6% |
| Rendita, categoria e superficie coperta | 0,794 | 70,4% |
| Rendita, categoria e composizione degli spazi | 0,763 | 67,3% |
| Rendita, categoria, coperto e composizione | 0,793 | 72,6% |

AUC misura la capacità di ordinare gli esiti, non una percentuale di accuratezza.
La composizione può modificare la selezione dei primi casi senza migliorare tutto
l'ordinamento. Nel sottocampione di 81 unità con prevalenza di capannone, aggiungere
la composizione alla dimensione riduce l'AUC da 0,824 a 0,786. Nelle 63 unità di
studi creati nel 2026, l'AUC è circa 0,780 con la rendita, 0,787 aggiungendo categoria
e dimensione e 0,769 con tutte le caratteristiche. L'anno dello studio non è una
vera separazione temporale degli input.

La penalizzazione influisce sui risultati: sul campione completo, usando valori
1, 2 e 5, il modello con categoria e dimensione ha AUC 0,830, 0,794 e 0,750.
Non è stata scelta la configurazione migliore per presentarla come conclusiva.
Con sole 59 unità prevalentemente geometriche, l'AUC della rendita è 0,740 e quella
del modello completo 0,786, ma le etichette e le misure restano prodotte dal tecnico.

In 14 studi con entrambi gli esiti, il rapporto rendita/coperto ordina i casi meglio
della rendita in media: AUC descrittiva 0,909 contro 0,728. Non è una prova su nuovi
studi: utilizza le misure realizzate durante le valutazioni storiche.

Questi risultati indicano quali famiglie di fatti vale la pena estrarre, senza
dimostrare l'accuratezza di un sistema automatico su immobili nuovi. La scelta delle
ipotesi sullo stesso campione e la ridotta numerosità impediscono di trattare gli
incrementi osservati come prestazioni garantite.

## Lettura di quattro elaborati senza conoscere gli esiti

Una seconda sessione GPT 6.1 Sol xhigh standard ha ricevuto solo nove immagini di
quattro PDF e i subalterni obiettivo. Non ha ricevuto rendite, esiti, note, geometrie
salvate o risultati di questa analisi. I casi sono stati scelti per diversità di
destinazioni, non casualmente; è una prova qualitativa di fattibilità.

| Elaborato | Risultato della lettura |
| --- | --- |
| A, 1575950, sub 8, una pagina | Attribuibili alcune sagome e piani; uffici e tettoie non confermabili dalle etichette, pur essendo presenti nella bozza |
| B, 1572339, sub 3, due pagine | «Piazzale Sub3» esplicito; il piano primo è del sub 2 e non va attribuito al 3; uso del corpo e strutture accessorie non determinabile |
| C, 1572519, sub 49, due pagine | Legenda «Silos (ricovero auto)»; sei livelli sotto strada; uffici, ristorante e depositi della legenda appartengono ad altri sub |
| D, 1574179, sub 4, quattro pagine | Tre livelli attribuibili, compreso uno sotto strada; uso commerciale non esplicito; «CF4» non è il sub 4 e aree circostanti non attribuibili integralmente |

La lettura non ha prodotto m² o nuove valutazioni. Indica che riconoscere sagome,
piani e sub è possibile in alcuni casi, ma la destinazione non è sempre nel disegno.
Servono elenchi subalterni, planimetrie delle singole unità e altre fonti, distinguendo
un'informazione assente da una destinazione assente.

## Controlli tecnici emersi dai casi

- **Attribuzione delle parti comuni.** Nello studio 4631, la bozza del sub 702,
  studentato, comprende parcheggio interrato; l'elenco distingue il 703, autorimessa,
  presente separatamente nel portafoglio senza gruppo condiviso. È una possibile
  incoerenza di perimetro da verificare, non un doppio conteggio accertato.
- **Dimensioni da fonti diverse.** Nel 1575950, l'elenco riporta corte esclusiva di
  8.738 m² e la bozza circa 8.885 m² esterni. Non sono necessariamente la stessa
  misura: confrontare significato, confine e data, evitando di usare corti dei sub
  soppressi come se fossero correnti.
- **Terreno separato dall'area scoperta.** Il 1575689 ha un lotto stimato in percentuale
  del valore base, pur senza area di lotto compilata. Zero superficie salvata non
  significa zero valore del terreno o assenza del lotto.
- **Codifica coerente delle destinazioni.** Nel 4632, «Ospedale» custom e
  «casa-di-cura» finiscono in classi analitiche diverse, nonostante funzioni affini.
  Conservare un vocabolario fisico distinto dall'etichetta libera del calcolo.

Il prossimo esperimento utile è ricostruire, senza conoscere l'esito, superfici e
destinazioni di un campione più ampio combinando elaborati ed elenchi subalterni.
Per ogni campo confrontare l'estrazione con una misura o destinazione verificata,
registrando anche i casi non determinabili. Solo dopo va misurato il rendimento
dell'ordinamento alimentato da quelle estrazioni.

## Riproducibilità

`python3 scripts/ordinamento/space_patterns.py` produce `space-features.csv`,
`space-cv-*.csv`, `space-within-study.csv` e `space-findings.json` nello snapshot
locale ignorato da Git. L'ultimo contiene anche l'audit dei campi da raccogliere.
I componenti del valore si riconciliano con `totalBaseAmount` entro 0,10 €; sono
conservati per diagnosi e non entrano nei modelli predittivi.

La revisione qualitativa resta in `.research/space-review-sol61.txt`; il tentativo
senza esiti in `.research/blind-spaces-sol61.txt`, con immagini in
`.research/blind-spaces/` e abbinamento ai documenti in `blind-space-mapping.json`
dentro lo snapshot. Nessun PDF o immagine è incluso nella branch pubblicata.
