# Benchmark modelli NeuralWatt per estrazione scala

Benchmark eseguito il 30 luglio 2026 con la stessa pipeline di produzione, su quattro PDF reali e
cinque pagine complessive. Le scale attese erano `1:1000`, `1:2000`, `1:1000`, `1:1000` e `1:2000`.

| Modello | Pagine corrette | Tempo complessivo | Retry | Esito |
| --- | ---: | ---: | ---: | --- |
| `qwen3.6-35b-fast` | 5/5 | 12,0 s | 0 | Selezionato |
| `kimi-k2.7-code` | 5/5 | 28,1 s | 0 | Corretto, più lento |
| `qwen3.6-35b` | 2/5 | 43,8 s | 2 risposte JSON non valide | Non selezionato |

Qwen3.6 35B Fast ha eguagliato Kimi in accuratezza ed è risultato circa 2,3 volte più rapido.

Le varianti `qwen3.6-5b-fast` e `qwen3.6-5b` non risultavano nel catalogo `/v1/models` di NeuralWatt
e l'API ha risposto `404 Model not found` per entrambe. Per questo non sono state configurate come
fallback delle visure e OpenRouter resta, temporaneamente, il solo fallback per PDF privi di testo
estraibile localmente.
