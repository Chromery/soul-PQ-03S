# Ripartenza Nginx sulla VPS di produzione

Il 14 novembre 2026 l'aggiornamento automatico di libc ha riavviato insieme
Nginx e `systemd-resolved`. Il resolver locale è stato fermato alle
06:50:33.902 CET; Nginx ha tentato l'avvio alle 06:50:33.906, fallendo il
controllo della configurazione perché non riusciva a risolvere
`frontend-api.clerk.dev`. Il resolver è risultato pronto alle 06:50:34.395.
Con `Restart=no`, Nginx è rimasto fermo fino al ripristino manuale del
18 novembre. I container dell'applicazione erano rimasti attivi.

## Configurazione

La sorgente del drop-in è
[`docker/client-vps/nginx-recovery.conf`](../docker/client-vps/nginx-recovery.conf).
Si applica soltanto al Nginx di sistema sulla VPS cliente `212.237.9.85`;
non al Nginx nel container web e non al vecchio ambiente locale archiviato.

- `Wants` avvia il resolver quando viene avviato Nginx; `After` ordina Nginx
  dopo il resolver anche quando entrambi vengono riavviati nella stessa
  operazione. Il resolver usa `Type=notify` e segnala quando è pronto.
- Si usa `Wants`, senza `Requires`, `BindsTo` o `PartOf`: un riavvio del solo
  resolver non deve fermare un Nginx già funzionante.
- `Restart=on-failure` e `RestartSec=10s` ritentano anche dopo un errore di
  `ExecStartPre` (`nginx -t`). L'ordine dei servizi non garantisce che i DNS
  esterni siano già raggiungibili: il retry copre anche questa eventualità.
- `StartLimitIntervalSec=0` evita che un guasto prolungato esaurisca i tentativi.
  La pausa di dieci secondi impedisce un ciclo rapido di riavvii. Anche un
  errore permanente di configurazione continuerà a produrre tentativi e log
  fino alla correzione o a uno stop manuale.
- Uno stop esplicito con `systemctl stop nginx` resta rispettato.

## Installazione

Dopo aver trasferito il file dalla branch `main`, sulla VPS cliente:

```sh
nginx -t
install -d -m 0755 /etc/systemd/system/nginx.service.d
# Se esiste già, salvare prima una copia del drop-in corrente.
install -m 0644 nginx-recovery.conf /etc/systemd/system/nginx.service.d/20-pq-recovery.conf
systemd-analyze verify nginx.service
systemctl daemon-reload
systemctl show nginx -p Wants -p After -p Restart -p RestartUSec -p StartLimitIntervalUSec
systemctl is-active nginx systemd-resolved
curl --fail --silent --show-error https://pq.soul.it/api/health
```

`daemon-reload` applica la politica senza riavviare Nginx e senza interrompere
le connessioni. Non servono build, aggiornamenti delle immagini o migrazioni.
La versione applicativa rimane invariata.

## Verifica e rollback

Verificare l'ordine di avvio e un fallimento iniziale seguito da recupero
automatico con unità di prova isolate, senza fermare il resolver o Nginx
di produzione. Verificare anche che uno stop manuale non generi retry.
Conservare configurazione precedente, risultati e timestamp in
`/srv/soul-pq/maintenance/`.

Applicato il 18 novembre 2026 alle 09:42 UTC. Le unità di prova isolate hanno
verificato l'ordine di riavvio contemporaneo, il recupero da un errore iniziale
di `ExecStartPre` dopo 10,196 secondi, il mantenimento del processo web durante
il riavvio del solo resolver e il rispetto dello stop manuale. Le unità di
prova sono state rimosse. I PID del Nginx e del resolver reali sono rimasti
invariati durante test e applicazione. Evidenze e script di verifica:
`/srv/soul-pq/maintenance/nginx-recovery-20261118/`.

Per annullare la modifica, ripristinare la copia precedente di
`/etc/systemd/system/nginx.service.d/20-pq-recovery.conf` oppure rimuovere
solo questo file se prima non esisteva, quindi eseguire `systemctl daemon-reload`.

Riferimenti: [dipendenze e limiti systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html),
[politica di riavvio](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#Restart=).
