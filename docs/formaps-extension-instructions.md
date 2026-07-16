# Integrazione forMaps Open nella piattaforma principale

## Obiettivo

Implementare nella piattaforma principale un pulsante che, partendo da una lista di dati catastali, apra una nuova scheda forMaps per ogni particella e lasci all'estensione Chrome `forMaps Open` il compito di compilare automaticamente la UI di forMaps.

La piattaforma principale deve generare gli URL forMaps con il payload corretto nel fragment `#formapsOpen=...`.
Il proxy CAPTCHA/Qwen non vive piu in un servizio Tailscale separato: e incorporato nell'API PQ come `POST /api/qwen-captcha` e usa `NEURALWATT_API_KEY` dal `.env`.

## Prerequisito Utente

L'utente deve avere installata l'estensione Chrome `forMaps Open`.
In PQ alpha l'helper e lo zip dell'estensione sono serviti dalla webapp:

- helper: `/formaps-open/`
- zip estensione: `/formaps-open/formaps-open-extension.zip`

Senza estensione:

- forMaps si apre comunque;
- i dati non vengono compilati automaticamente.

## Contratto Dati

Ogni particella deve essere rappresentata così:

```ts
type ForMapsEntry = {
  provincia: string;
  comune: string;
  foglio: string | number;
  particella: string | number;
};
```

Esempio:

```ts
{
  provincia: "Como",
  comune: "CASNATE CON BERNATE/sez.B",
  foglio: 4,
  particella: 370
}
```

## Implementazione Consigliata

Aggiungere nel frontend della piattaforma principale una utility equivalente:

```ts
const defaultLayers = [
  { Nome: "particelle", Acceso: true, Opacita: 50 },
  { Nome: "fabbricati", Acceso: true, Opacita: 75 },
  { Nome: "numeroParticella", Acceso: true, Opacita: 100 },
  { Nome: "simboloGraffa", Acceso: true, Opacita: 100 }
];

function toBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildForMapsUrl(entry: ForMapsEntry): string {
  const lCat = encodeURIComponent(JSON.stringify(defaultLayers));
  const payload = toBase64Url({
    source: "formaps-open",
    version: 2,
    createdAt: new Date().toISOString(),
    entry: {
      provincia: entry.provincia,
      comune: entry.comune,
      foglio: String(entry.foglio),
      particella: String(entry.particella)
    },
    options: {
      openCatPanel: true,
      captureCaptcha: true,
      qwenCaptchaEndpoint: `${window.location.origin}/api/qwen-captcha`
    }
  });

  return `https://www.formaps.it/Mappa?LCat=${lCat}&Experimental=False#formapsOpen=${payload}`;
}

export function openEntriesInForMaps(entries: ForMapsEntry[]): void {
  for (const entry of entries) {
    const tab = window.open(buildForMapsUrl(entry), "_blank");

    if (tab) {
      tab.opener = null;
    }
  }
}
```

## Uso Nel Pulsante

Il metodo `openEntriesInForMaps` deve essere chiamato direttamente dentro l'handler del click utente.

Esempio:

```ts
button.addEventListener("click", () => {
  openEntriesInForMaps(entries);
});
```

Non chiamarlo dopo await, timeout, polling o callback non direttamente collegati al click: Chrome potrebbe bloccare le nuove schede come popup.

## Opzioni Payload

`openCatPanel`:

- `true`: apre la sezione CAT prima della compilazione. E il default attuale per rendere piu visibile cosa sta facendo l'estensione.
- `false`: l'estensione usa il DOM di forMaps senza aprire visivamente il pannello CAT.

`captureCaptcha`:

- `true`: quando forMaps mostra il CAPTCHA, l'estensione salva file diagnostici in `Downloads/formaps-open/` e invia l'immagine al proxy Qwen se `qwenCaptchaEndpoint` e valido.
- `false`: disabilita la cattura diagnostica.

Il pannello di stato dell'estensione è posizionato sotto i comandi in alto a destra di forMaps. Il pulsante
`−` lo riduce alla sola intestazione, mentre `+` ripristina il messaggio operativo.

Dalla versione 0.4.0 provincia e comune arrivano già normalizzati sul catalogo catastale forMaps. Se un valore
non coincide ancora, l'estensione confronta la lista completa restituita dal Select2 e accetta il candidato più
simile soltanto quando supera soglia e margine di sicurezza; le sezioni ambigue non vengono scelte arbitrariamente.

`qwenCaptchaEndpoint`:

- in alpha deve essere `https://soul-pq-alpha.rainailab.com/api/qwen-captcha` o lo stesso path sulla origin corrente;
- l'estensione accetta anche `https://soul-pq-alpha-2.iggau.com/api/qwen-captcha` e fallback locali per sviluppo.

## Vincoli Browser

- Aprire molte schede può richiedere autorizzazione popup da parte dell'utente.
- La chiamata deve partire da un gesto utente esplicito.
- Non usare iframe verso forMaps: la compilazione cross-origin non è consentita.
- Non provare a comunicare direttamente con la pagina forMaps dalla piattaforma principale; il fragment URL è il canale previsto.

## Test Di Accettazione

1. Installare l'estensione Chrome `forMaps Open`.
2. Aprire la piattaforma principale.
3. Selezionare una o più particelle.
4. Cliccare il pulsante "Apri in forMaps".
5. Verificare che venga aperta una scheda forMaps per ogni particella.
6. Verificare che l'estensione compili provincia, comune, foglio e particella.
7. Se compare CAPTCHA, verificare che l'estensione salvi i file in `Downloads/formaps-open/` e compili il codice letto via Neuralwatt/Qwen.

## Dati Di Test

Usare questi valori per il test iniziale:

```json
{
  "provincia": "Como",
  "comune": "CASNATE CON BERNATE/sez.B",
  "foglio": "4",
  "particella": "370"
}
```
