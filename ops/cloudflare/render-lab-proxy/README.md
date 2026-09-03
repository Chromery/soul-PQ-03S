# Cloudflare proxy per il laboratorio di rendering

Questo Worker espone `st-pq-soul.rainailab.com` e inoltra le richieste alla
porta locale configurata in `UPSTREAM_ORIGIN` attraverso un binding Workers
VPC al tunnel `soul-pq-ovh`. Il deploy corrente usa la porta `8181` del vero
ambiente staging e non richiede una seconda porta pubblica.

Quando `UPSTREAM_ORIGIN` punta al laboratorio isolato sulla porta `8282`, il
solo PDF campione viene letto direttamente dall'endpoint pubblico di PQ:
farlo ripassare dal proxy nginx del laboratorio creerebbe un secondo ingresso
nello stesso tunnel, che Cloudflare blocca correttamente come loop.

Deploy dalla directory corrente:

```sh
nvm use 24
npx wrangler deploy
```

La funzionalita Workers VPC e attualmente in beta. Il Worker e il dominio
personalizzato possono essere rimossi al termine della prova senza modificare
la configurazione dell'applicazione principale.
