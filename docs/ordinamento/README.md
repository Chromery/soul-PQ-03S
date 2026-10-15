# Ricerca ordinamento

Prima analisi: [risultati del 15 ottobre 2026](2026-10-15-analisi-iniziale.md).
Approfondimento: [confronto con T3, casi individuali e verifica dei pattern](2026-10-15-approfondimento-pattern.md).
Ulteriore analisi: [composizione degli spazi e lettura degli elaborati senza esiti](2026-10-15-spazi-e-raccolta-dati.md).
Proposta: [dati da raccogliere durante gli studi in PQ](dati-da-raccogliere-in-pq.md).

Questo modulo studia la priorità di analisi degli immobili. Non modifica il prodotto,
gli esiti del tecnico o le rendite in produzione. Nessun modello è distribuito.

## Ambiente e dati

- Branch: `ordinamento`, derivata da `main` al commit `e0529fe63b90f59146ac81e3563dff5077375892`.
- Worktree: `/home/debian/dev/Dashboard-generale-03S-ordinamento`.
- Compose dedicato: `compose.ordinamento.yaml`, progetto `soul-pq-ordinamento`.
- Container: `soul-pq-ordinamento-postgres-1`; database `soul_ordinamento`, utente `research`.
- Nessuna porta pubblicata; rete Docker `none`; nessuna API, sincronizzazione ERP o estrazione automatica in background.
- Snapshot corrente: `.research/20261015T013337Z/`, indicato anche da `.research/LATEST`.
- PostgreSQL ha `default_transaction_read_only=on` dopo il ripristino. È una protezione operativa predefinita, non un vincolo contro un amministratore del container.
- Il dump completo conserva la consistenza delle relazioni, inclusi gli archiviati. **Il campione analitico esclude tutti gli studi con `isTest=true`**. Conserva positivi, negativi e sospesi in colonne distinte.
- Dati nominativi, documenti, dump, credenziali locali ed export sono esclusi sia da Git sia dal contesto di build Docker tramite `.research/`. Non caricarli su GitHub.

La produzione di origine è quella attuale su `pq.soul.it`, `/srv/soul-pq`.
Il database locale del vecchio progetto di produzione non è stato usato o modificato.
Il dump non contiene gli allegati: quelli già presenti sono stati copiati separatamente
con sole operazioni S3 `GetObject`, verificati per checksum/dimensione e deduplicati per SHA-256.
L'estrazione testuale in blocco usa Poppler locale; la revisione mirata di note,
visure e planimetrie è svolta nelle sessioni Codex di ricerca.

## Riprodurre l'analisi esistente

Da questo worktree, con il container di ricerca avviato:

```sh
python3 scripts/ordinamento/export.py
python3 scripts/ordinamento/analyze.py
python3 scripts/ordinamento/document_features.py
python3 scripts/ordinamento/economics.py
python3 scripts/ordinamento/refine_patterns.py
python3 scripts/ordinamento/space_patterns.py
python3 -m unittest discover -s scripts/ordinamento -p 'test_*.py' -v
```

Gli script Python usano la libreria standard. Gli esiti delle presentazioni sono
riconciliati con le unità di valutazione attraverso l'insieme esatto dei membri.
`cluster-overrides.json`, nella directory dello snapshot, conserva un raggruppamento
societario verificato nelle note e usato solo per separare i campioni di validazione.
Gli identificativi catastali duplicati, le partite IVA e gli StudyGroup producono
ulteriori raggruppamenti automatici. Senza quel file i risultati della validazione
possono cambiare; i conteggi descrittivi delle unità restano uguali.

Per consultare il DB locale senza rete:

```sh
docker exec -it soul-pq-ordinamento-postgres-1 psql -X -U research -d soul_ordinamento
```

Per riavviare solo questo database, se fermato:

```sh
/usr/libexec/docker/cli-plugins/docker-compose --env-file .research/local.env -f compose.ordinamento.yaml -p soul-pq-ordinamento up -d postgres
```

Non usare il `compose.yaml` applicativo in questo worktree.

## Acquisizione iniziale: già eseguita

`python3 scripts/ordinamento/snapshot.py` acquisisce un dump consistente con
`pg_dump`, connessione sorgente in sola lettura, timeout di acquisizione lock,
e lo ripristina esclusivamente in una destinazione nuova e isolata. Verifica branch,
progetto Compose e assenza di porte. Rifiuta container o volumi di ricerca già esistenti;
non sovrascrive il campione corrente. L'accesso SSH usa la configurazione amministrativa
già presente su questo host; nessuna chiave è inclusa nel repository.

Il download documentale richiede le dipendenze Node già previste dal repository:

```sh
NODE_PATH=/home/debian/dev/Dashboard-generale-03S/node_modules node scripts/ordinamento/download-documents.cjs
```

Il `NODE_PATH` qui punta alle dipendenze già installate, utilizzate solo in lettura.
In un clone con dipendenze proprie basta `node scripts/ordinamento/download-documents.cjs`.
Le impostazioni S3 sono lette in memoria dal servizio sorgente; non sono stampate o salvate.
In questa prima acquisizione sono stati verificati 433 riferimenti e 369 file distinti.

Per ripetere l'estrazione del text layer con Poppler nell'immagine API già presente:

```sh
python3 - <<'PY'
import os
from pathlib import Path
import subprocess
os.umask(0o077)
root = Path.cwd()
base = root / '.research'
dest = base / (base / 'LATEST').read_text().strip()
partial = dest / 'document-text.json.part'
with partial.open('w') as output:
    subprocess.run([
        'docker', 'run', '--rm', '-i', '--user', f'{os.getuid()}:{os.getgid()}',
        '--network', 'none', '--memory', '384m', '--cpus', '0.5', '--read-only',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '-v', str(dest) + ':/data:ro', '--entrypoint', 'node', 'soul-pq-staging-api', '-'
    ], input=(root / 'scripts/ordinamento/extract-documents.cjs').read_text(),
       text=True, stdout=output, check=True)
partial.replace(dest / 'document-text.json')
PY
```

È un container temporaneo senza rete che esegue solo Poppler e Node. L'applicazione
e i worker dell'immagine non vengono avviati. L'estrazione del testo delle planimetrie
non equivale al riconoscimento automatico delle superfici: le geometrie analizzate
provengono dalle annotazioni già salvate dal tecnico.

## Output locali

Tutti nella directory indicata da `.research/LATEST`:

| File | Contenuto |
| --- | --- |
| `production.dump`, `manifest.json` | Snapshot verificato, origine, data e checksum |
| `cohort.json` | Studi non archiviati e relative relazioni |
| `documents/`, `document-manifest.json` | PDF deduplicati e collegamenti agli immobili |
| `document-text.json` | Testo estratto localmente |
| `properties.csv`, `evaluated-units.csv` | Righe analitiche e unità/gruppi con esito esplicito |
| `findings.json` | Conteggi, associazioni, geometrie e verifica esplorativa |
| `exploratory-cv.csv` | Predizioni di ricerca per fold; non usare come probabilità commerciali |
| `visura-features.json`, `visura-features.csv` | Indicatori con SHA, pagina ed evidenza testuale |
| `document-findings.json` | Conteggi degli indicatori documentali |
| `positive-property-audit.csv` | Controllo delle proposte a livello immobile; gruppi non sommabili |
| `positive-unit-proposals.csv`, `economics-findings.json` | Proposte economiche per unità/gruppo, da presentazioni datate |
| `refined-findings.json`, `refined-cv-*.csv` | Confronto dei segnali documentali sullo stesso campione e con gruppi separati |
| `comparable-geometry-pairs.csv` | Coppie con esito opposto, stesso studio/categoria e rendite vicine; misure manuali |
| `t3-study-presentations.csv` | Riconciliazione delle proposte per studio, incluse presentazioni condivise |
| `space-features.csv`, `space-findings.json` | Destinazioni annotate, componenti del valore, associazioni e audit della raccolta dati |
| `space-cv-*.csv`, `space-within-study.csv` | Verifiche esplorative delle geometrie manuali, con gruppi separati e confronti interni agli studi |
| `baseline-document-review-queue.csv` | 599 immobili neutri D esclusa D/10 ordinati per rendita, per raccogliere evidenza |

La coda da 599 righe è solo una baseline di acquisizione documentale nel portafoglio
esistente: probabilità e risparmio atteso sono intenzionalmente vuoti. Non applica
ancora tutte le esclusioni fiscali o commerciali e non autorizza contatti automatici.

Per i gruppi, `evaluated-units.csv` non espone una proposta ereditata dal primo membro:
i valori di proposta restano vuoti. Usare `positive-unit-proposals.csv` per importi
riconciliati con l'insieme esatto dei membri della presentazione.
