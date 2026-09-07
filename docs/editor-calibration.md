# Editor: taratura multipagina e destinazioni (1.0.2)

Con il Righello tracciare un segmento, inserire la distanza reale in metri e premere
**Taratura**. Nei PDF multipagina scegliere **Solo pagina corrente** (predefinito) o
**Tutte le pagine**, poi confermare. Annulla non modifica alcuna scala. Su una sola
pagina resta l'applicazione diretta.

L'applicazione a tutte le pagine trasferisce la scala ricavata dal segmento e il
formato di stampa corrente (A3/A4), sostituendo anche eventuali tarature precedenti.
Usarla solo quando le pagine condividono scala e formato di stampa. Non copia le
coordinate del segmento sulle altre pagine, non modifica rotazioni o metadati AI.
Le pagine restano indipendenti: una modifica successiva riguarda solo quella attiva.
Indietro/Ripeti ripristina l'intera operazione, anche dopo aver cambiato pagina.
Salva bozza conserva i valori per pagina nel campo `pageScales` gia esistente.
Nessuna migrazione del database o modifica delle API ERP.

Nuove destinazioni in sidebar e selettori delle aree: Negozio, Commerciale,
Laboratorio, Casa di cura, Hotel, Loc. tecnici e Parcheggio multipiano.
Non essendo state fornite tariffe, il valore iniziale e 0 €/m²: l'operatore deve
inserire il valore corretto prima di usare la stima. I tipi e i valori scelti sono
conservati nella bozza. Le destinazioni e le tariffe precedenti restano invariate.

Il collaudo browser usa login staging reale e un PDF sintetico di tre pagine con
scale/formati inizialmente diversi. Dati studio, PDF e salvataggi sono isolati tramite
fixture: nessuna modifica agli studi del cliente. Verifica scelta predefinita,
annullamento, applicazione multipagina, undo/redo dopo cambio pagina, riapertura,
modifica indipendente e persistenza delle nuove destinazioni.
