# Istruzioni operative del progetto

## Worktree e ambienti di deploy

- `/home/debian/dev/Dashboard-generale-03S` e il worktree della branch `staging`. Da questa cartella si costruisce e si aggiorna esclusivamente l'ambiente di staging (`soul-pq-staging`, raggiungibile su `http://100.68.243.18:8181`).
- `/home/debian/dev/Dashboard-generale-03S-main` e il worktree collegato della branch `main`. Da quella cartella si costruisce e si aggiorna esclusivamente l'ambiente principale pubblicato su `https://pq-soul.rainailab.com` (`soul-prospect-qualifier`).
- `Dashboard-generale-03S-main` non e un secondo clone indipendente: e un Git worktree e condivide repository, cronologia, remote e oggetti Git con la cartella principale.
- La separazione effettiva tra produzione e staging e realizzata dai distinti progetti Docker Compose, immagini, porte e database. I due worktree non sono tecnicamente indispensabili per tenere online entrambi gli ambienti, ma evitano di cambiare branch nella stessa cartella e riducono il rischio di costruire o distribuire la branch sbagliata.
- Prima di ogni build o deploy verificare sempre branch, stato Git, progetto Compose e porte. Non eliminare il worktree `Dashboard-generale-03S-main` e non usare la cartella sbagliata per un deploy, salvo richiesta esplicita dell'utente.
