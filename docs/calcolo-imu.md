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
fallback ed estremi/link della delibera. L'IMU attuale ricevuta dall'ERP viene preservata; quella calcolata dalla
rendita attuale viene usata solo se il dato ERP è assente.

## Aggiornamento delle delibere

Il dataset compatto usato dall'API è generato e versionato in
`apps/api/src/imu/imu-rates.generated.ts`. Per aggiornarlo:

```sh
npm run imu:sync
npm run test:imu
npm run build
```

Lo script scarica nuovamente `estrazioni.jsonl`, usa `GITHUB_TOKEN`/`GH_TOKEN` oppure la sessione autenticata
di GitHub CLI, mantiene l'ultima pubblicazione per comune e anno e rigenera il file. In questo modo un nuovo
prospetto 2026 sostituisce automaticamente il precedente, mentre i comuni ancora privi del 2026 continuano a
usare il 2025.

## Limiti dichiarati

- nessun ragguaglio per mesi di possesso;
- nessuna applicazione automatica di quote di proprietà;
- nessuna detrazione per abitazione principale;
- nessuna riduzione per comodato, locazione concordata, inagibilità o altre condizioni soggettive;
- nessun calcolo per terreni o aree fabbricabili, che non partono da una rendita catastale di fabbricato.

Il risultato è quindi una stima annuale ordinaria per confrontare rendita attuale e proposta, non un sostituto
del conteggio fiscale definitivo.
