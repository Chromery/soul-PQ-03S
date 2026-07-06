const defaultSettings = {
  autoSubmitCaptchaSearch: false,
  autoSubmitDelaySeconds: 3
};

const autoSubmitInput = document.querySelector("#autoSubmitCaptchaSearch");
const delayInput = document.querySelector("#autoSubmitDelaySeconds");
const statusElement = document.querySelector("#status");

function clampDelay(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return defaultSettings.autoSubmitDelaySeconds;
  }

  return Math.min(60, Math.max(0, Math.round(parsed)));
}

function setStatus(message) {
  statusElement.textContent = message;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(defaultSettings);

  autoSubmitInput.checked = Boolean(stored.autoSubmitCaptchaSearch);
  delayInput.value = String(clampDelay(stored.autoSubmitDelaySeconds));
}

async function saveSettings() {
  const settings = {
    autoSubmitCaptchaSearch: Boolean(autoSubmitInput.checked),
    autoSubmitDelaySeconds: clampDelay(delayInput.value)
  };

  delayInput.value = String(settings.autoSubmitDelaySeconds);
  await chrome.storage.local.set(settings);
  setStatus("Salvato.");
}

autoSubmitInput.addEventListener("change", saveSettings);
delayInput.addEventListener("change", saveSettings);
delayInput.addEventListener("input", () => setStatus(""));

loadSettings().catch((error) => {
  setStatus(error && error.message ? error.message : String(error));
});
