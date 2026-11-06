# Calcolo IMU

PQ calcola l'IMU annua prevista a partire dalla rendita proposta e dalle aliquote estratte nella repository
[`Chromery/soul-delibere-rk`](https://github.com/Chromery/soul-delibere-rk), file
`estratti/estrazioni.jsonl`.

## Formula

Per un fabbricato dotato di rendita catastale:

```text
baseImponibile = rendita * 1,05 * moltiplicatoreCatastale
imuAnnua = baseImponibile * (aliquotaPercentuale / 100)
```

Moltiplicatori applicati:

| Categoria | Moltiplicatore |
| --- | ---: |
| Gruppo A, escluso A/10; C/2, C/6, C/7 | 160 |
| Gruppo B; C/3, C/4, C/5 | 140 |
| A/10 e D/5 | 80 |
| Gruppo D, escluso D/5 | 65 |
| C/1 | 55 |

La rendita viene rivalutata del 5%. L'importo è arrotondato ai centesimi e rappresenta l'intero anno per una
quota imponibile del 100%.

## Scelta dell'aliquota

1. Il comune viene individuato con nome normalizzato e sigla della provincia.
2. Si cerca la delibera più recente pubblicata per il 2026.
3. Se il comune non ha una delibera 2026, si usa il record 2025 e il risultato viene marcato `usedFallback`.
4. Si seleziona la riga ordinaria del prospetto MEF:
   - `Fabbricati rurali ad uso strumentale` per D/10;
   - `Fabbricati appartenenti al gruppo catastale D` per le altre categorie D;
   - `Altri fabbricati` per le categorie non D.
5. Aliquote agevolate o condizionate non vengono inferite: PQ non dispone ancora di uso effettivo, contratto,
   residenza, mesi e quota di possesso necessari a verificarne i requisiti.

Se l'estrazione è una delibera comunale a formato libero anziché un prospetto MEF strutturato, il calcolo viene
segnalato come non disponibile. Questo evita di scegliere una percentuale soltanto dal contesto OCR/testuale;
il caso riguarda soprattutto i tributi provinciali IMI/IMIS di Bolzano e Trento.

L'API restituisce con ogni immobile importo, base imponibile, moltiplicatore, aliquota, anno, indicazione del
fallback ed estremi/link della delibera. Il link apre il PDF tramite `GET /api/imu/delibere/:sha256`: al primo
accesso l'API legge il file dalla libreria persistente locale configurata con `IMU_DOCUMENT_LIBRARY_DIR` e
verifica che lo SHA-256 coincida con quello usato per il calcolo. Il runtime non effettua download da GitHub.
L'IMU attuale ricevuta dall'ERP viene preservata; quella calcolata dalla rendita attuale viene usata solo se il
dato ERP è assente.

## Aggiornamento delle delibere

Il dataset compatto usato dall'API è generato e versionato in
`apps/api/src/imu/imu-rates.generated.ts`. Per aggiornarlo:

```sh
npm run imu:sync
npm run test:imu
npm run build
```

Lo script di build scarica nuovamente `estrazioni.jsonl`, usa `GITHUB_TOKEN`/`GH_TOKEN` oppure la sessione
autenticata di GitHub CLI, mantiene l'ultima pubblicazione per comune e anno e rigenera il file. In questo modo
un nuovo prospetto 2026 sostituisce automaticamente il precedente, mentre i comuni ancora privi del 2026
continuano a usare il 2025.

Separatamente, l'amministratore sincronizza l'intera cartella `delibere/` nel volume locale
`imu_delibere_cache`, montato in sola lettura logica dall'API come `/var/lib/soul-pq/imu-delibere`. Prima della
pubblicazione vanno verificati numero dei file, intestazione PDF e SHA-256 indicato in `estrazioni.jsonl`.
L'aggiornamento del dataset non deve essere distribuito senza la corrispondente sincronizzazione dei PDF:
l'API non ha un fallback verso GitHub o altre sorgenti remote.

## Verifica della libreria prima del rilascio

Il volume è un dato necessario all'applicazione: non viene popolato dall'immagine Docker e non va considerato
opzionale durante una migrazione. In particolare, il controllo `/api/health` non verifica i PDF delle delibere.
Prima di un rilascio o di un aggiornamento del dataset, eseguire il controllo completo:

```sh
node scripts/check-imu-library.mjs --library=/percorso/libreria
```

Lo script legge il dataset versionato, verifica ogni file, intestazione `%PDF-` e SHA-256, e termina con codice
non zero se manca anche un solo documento o se una versione è diversa. Un dataset vuoto non supera il controllo.
È possibile indicare il dataset di una specifica release con `--dataset=/percorso/imu-rates.generated.ts`.

Sulla VPS cliente il volume è `soul-prospect-qualifier_imu_delibere_cache`, montato nell'API come
`/var/lib/soul-pq/imu-delibere`. Per controllare proprio il dataset compilato nell'immagine in esecuzione:

```sh
docker cp scripts/check-imu-library.mjs soul-prospect-qualifier-api-1:/tmp/check-imu-library.mjs
docker exec -i soul-prospect-qualifier-api-1 node --input-type=module <<'JS'
import { checkImuLibrary } from '/tmp/check-imu-library.mjs';
import { IMU_RATE_RECORDS } from '/app/apps/api/dist/imu/imu-rates.generated.js';
const report = await checkImuLibrary(IMU_RATE_RECORDS, process.env.IMU_DOCUMENT_LIBRARY_DIR);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
JS
```

Per il ripristino, recuperare i PDF dalla repository privata `Chromery/soul-delibere-rk`, registrando il commit
sorgente. Copiarli in una directory temporanea nel volume, mantenendo i percorsi `delibere/...`, e verificare
l'intera directory contro il dataset effettivamente distribuito prima di attivarla. Un PDF differente non va
accettato cambiando il checksum o aggiornando le aliquote: occorre recuperare la versione attesa. Verificare
poi il PDF attraverso `ImuDocumentsService` e il controller, compresi intestazione e contenuto della risposta.
Il ripristino dei documenti non richiede modifiche agli studi, alle aliquote o al database.

Il 6 novembre 2026 la libreria della VPS è stata popolata con i 7.517 PDF referenziati dalla versione 1.3.0,
verificati contro la sorgente `47fcd7e3e5d1e99f3f4670581d8c60336dc730f2`. Evidenze operative:
`/srv/soul-pq/maintenance/imu-library-20261106/`.

## Limiti dichiarati

- nessun ragguaglio per mesi di possesso;
- nessuna applicazione automatica di quote di proprietà;
- nessuna detrazione per abitazione principale;
- nessuna riduzione per comodato, locazione concordata, inagibilità o altre condizioni soggettive;
- nessun calcolo per terreni o aree fabbricabili, che non partono da una rendita catastale di fabbricato.

Il risultato è quindi una stima annuale ordinaria per confrontare rendita attuale e proposta, non un sostituto
del conteggio fiscale definitivo.
