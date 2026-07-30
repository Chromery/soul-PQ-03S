# Benchmark NeuralWatt per fallback visure

Benchmark eseguito il 30 luglio 2026 su cinque visure reali. Ogni PDF è stato renderizzato in JPEG per
simulare un documento scansionato privo di text layer, cioè il caso in cui la pipeline locale non basta.

| Modello | Visure corrette | Tempo complessivo | Esito |
| --- | ---: | ---: | --- |
| `qwen3.6-35b-fast` | 5/5 | 10,8 s | Selezionato |
| `qwen3.6-35b` | 4/5 | 34,7 s | Non selezionato |

Il campione includeva visure senza sezione, con sezione catastale, con sezione urbana diversa dalla
sezione catastale e con riferimenti storici. Il prompt di produzione distingue esplicitamente
l'intestazione `Sezione Urbana` da un valore e preferisce la sezione dei Mappali Terreni Correlati quando
è riferita alla stessa particella.

La pipeline risultante è:

1. estrazione deterministica locale con `pdftotext`;
2. se gli identificativi restano incompleti, rendering locale delle prime quattro pagine a 150 DPI;
3. estrazione visuale con `qwen3.6-35b-fast` su NeuralWatt;
4. risoluzione deterministica forMaps, con eventuale spareggio NeuralWatt sulla sola shortlist.

Le variabili OpenRouter non vengono più passate al container API e il provider è temporaneamente
disabilitato.
