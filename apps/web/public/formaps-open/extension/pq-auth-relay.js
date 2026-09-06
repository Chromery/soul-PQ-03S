// Isolated extension world: no access tokens are exposed to forMaps or URL fragments.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "pq-authenticated-captcha") return false;
  if (typeof message.imageDataUrl !== "string" || !message.imageDataUrl.startsWith("data:image/") || message.imageDataUrl.length > 8_000_000) {
    sendResponse({ ok: false, error: "invalid_image" });
    return false;
  }
  fetch("/api/qwen-captcha", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", "x-formaps-open-extension": "1" },
    body: JSON.stringify({ imageDataUrl: message.imageDataUrl }),
    signal: AbortSignal.timeout(45_000)
  }).then(async (response) => sendResponse({ ok: response.ok, status: response.status, response: await response.json() }))
    .catch(() => sendResponse({ ok: false, error: "pq_session_unavailable" }));
  return true;
});
