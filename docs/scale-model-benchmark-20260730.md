# Benchmark modelli NeuralWatt per estrazione scala

Benchmark eseguito il 30 luglio 2026 con la stessa pipeline di produzione, su quattro PDF reali e
cinque pagine complessive. Le scale attese erano `1:1000`, `1:2000`, `1:1000`, `1:1000` e `1:2000`.

| Modello | Pagine corrette | Tempo complessivo | Retry | Esito |
| --- | ---: | ---: | ---: | --- |
| `qwen3.6-35b-fast` | 5/5 | 12,0 s | 0 | Selezionato |
| `kimi-k2.7-code` | 5/5 | 28,1 s | 0 | Corretto, più lento |
| `qwen3.6-35b` | 2/5 | 43,8 s | 2 risposte JSON non valide | Non selezionato |

Qwen3.6 35B Fast ha eguagliato Kimi in accuratezza ed è risultato circa 2,3 volte più rapido.

Il riferimento iniziale alle varianti 5B era un refuso. Il confronto corretto per il fallback visure tra
`qwen3.6-35b-fast` e `qwen3.6-35b` è documentato in `visura-model-benchmark-20260730.md`.
