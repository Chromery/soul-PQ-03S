const entriesForm = document.querySelector("#entries");
const template = document.querySelector("#entryTemplate");
const addRowButton = document.querySelector("#addRow");
const openButton = document.querySelector("#openFormaps");
const statusElement = document.querySelector("#status");
const openCatPanelInput = document.querySelector("#openCatPanel");

const defaultEntry = {
  provincia: "Como",
  comune: "CASNATE CON BERNATE/sez.B",
  foglio: "4",
  particella: "370"
};

const defaultLayers = [
  { Nome: "particelle", Acceso: true, Opacita: 50 },
  { Nome: "fabbricati", Acceso: true, Opacita: 75 },
  { Nome: "numeroParticella", Acceso: true, Opacita: 100 },
  { Nome: "simboloGraffa", Acceso: true, Opacita: 100 }
];

function addEntry(values = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  const data = { ...defaultEntry, ...values };

  for (const [key, value] of Object.entries(data)) {
    const input = node.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = value;
    }
  }

  node.querySelector(".remove").addEventListener("click", () => {
    node.remove();
    updateRemoveButtons();
  });

  entriesForm.append(node);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const rows = [...entriesForm.querySelectorAll(".entry")];
  rows.forEach((row, index) => {
    row.querySelector(".remove").style.visibility = index === 0 ? "hidden" : "visible";
  });
}

function readEntries() {
  return [...entriesForm.querySelectorAll(".entry")]
    .map((row) => ({
      provincia: row.querySelector('[name="provincia"]').value.trim(),
      comune: row.querySelector('[name="comune"]').value.trim(),
      foglio: row.querySelector('[name="foglio"]').value.trim(),
      particella: row.querySelector('[name="particella"]').value.trim()
    }))
    .filter((entry) => entry.provincia && entry.comune && entry.foglio && entry.particella);
}

function toBase64Url(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildForMapsUrl(entry) {
  const lCat = encodeURIComponent(JSON.stringify(defaultLayers));
  const payload = toBase64Url({
    source: "formaps-open",
    version: 2,
    createdAt: new Date().toISOString(),
    entry,
    options: {
      openCatPanel: true,
      captureCaptcha: true,
      qwenCaptchaEndpoint: `${window.location.origin}/api/qwen-captcha`
    }
  });

  return `https://www.formaps.it/Mappa?LCat=${lCat}&Experimental=False#formapsOpen=${payload}`;
}

addRowButton.addEventListener("click", () => {
  addEntry({ provincia: "", comune: "", foglio: "", particella: "" });
});

openButton.addEventListener("click", () => {
  const entries = readEntries();

  if (entries.length === 0) {
    statusElement.textContent = "Inserisci almeno una riga completa.";
    return;
  }

  let opened = 0;
  for (const entry of entries) {
    const tab = window.open(buildForMapsUrl(entry), "_blank");
    if (tab) {
      tab.opener = null;
      opened += 1;
    }
  }

  if (opened === entries.length) {
    statusElement.textContent = `${opened} scheda${opened === 1 ? "" : "e"} forMaps aperta${opened === 1 ? "" : "e"}.`;
  } else {
    statusElement.textContent = "Chrome ha bloccato una o piu schede: consenti i popup per questa pagina.";
  }
});

addEntry(defaultEntry);
