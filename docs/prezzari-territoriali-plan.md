# Piano Prezzari Territoriali

## Obiettivo

Associare a ogni immobile i prezzari piu rilevanti in base al territorio dell'immobile, rendendoli apribili da PQ come documenti protetti salvati su S3-compatible storage.

## Scelte pragmatiche

- I PDF/XLSX dei prezzari vengono caricati su S3 e non salvati nel browser.
- Nel DB salviamo solo metadati, chiavi S3 e ranking di associazione.
- I cookie non sono adatti: i prezzari sono file grandi, cambiano poco e il browser ha limiti stretti. Il caching HTTP del download protetto e' sufficiente.
- Il primo ranking usa regole territoriali deterministiche:
  - match comune/provincia: massima priorita;
  - match regione: priorita media;
  - fallback su distanza geografica tra centroide del territorio del prezzario e coordinate note/stimate dell'immobile;
  - ordinamento finale per score, distanza, anno piu recente.
- La geocodifica completa degli indirizzi puo arrivare dopo. Per ora usiamo comune/provincia/regione gia presenti nei dati ERP, piu una tabella leggera di centroidi dei territori coperti dai prezzari caricati.

## Modello dati proposto

- `PriceList`
  - territorio normalizzato: comune/provincia/regione/scope
  - titolo, nome file, mime type, S3 key, sha256, dimensione
  - anno stimato dal nome file
  - lat/lon del centroide territoriale quando disponibile
- `PropertyPriceList`
  - propertyId, priceListId
  - rank, score, reason, distanceKm

## Flusso operativo

1. Estrarre localmente lo zip in `00_prezzari2026/` senza committarlo.
2. Generare un manifest dai file utili, ignorando `__MACOSX`, `Thumbs.db` e file di supporto non documentali quando non servono.
3. Inferire territorio e anno dai nomi file/cartelle.
4. Caricare i documenti su S3 sotto `prezzari/<territorio>/<hash>-<file>`.
5. Inserire/upsertare i metadati in DB.
6. Dopo ogni sync ERP, associare i prezzari agli immobili dello studio.
7. Esporre le associazioni nell'API studi e un endpoint download protetto.
8. Mostrare in UI i prezzari ordinati e far aprire il primo/rilevante dall'editor.

## Limiti accettati in questa fase

- Niente geocoding esterno automatico finche non scegliamo provider/costi/rate limit.
- Per comuni non coperti, il ranking usa provincia/regione e poi distanza tra centroidi noti.
- Alcuni file possono essere allegati o fogli di calcolo: li carichiamo e li cataloghiamo, ma il ranking privilegia i PDF di prontuario/prezzario.

## Verifiche

- Build completa API/web.
- Download S3 dei prezzari campione.
- API studio con associazioni ordinate per almeno immobili in Lombardia/Veneto/Piemonte ecc.
- Nessun commit dello zip o della cartella estratta.
