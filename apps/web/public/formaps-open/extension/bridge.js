(function formapsOpenBridge() {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (!message || message.source !== "formaps-open-page") {
      return;
    }

    chrome.runtime.sendMessage(message)
      .then((response) => {
        if (!message.requestId) {
          return;
        }

        const responseType = message.type === "settings-request"
          ? "settings-response"
          : "captcha-captured-response";

        window.postMessage({
          source: "formaps-open-extension",
          type: responseType,
          requestId: message.requestId,
          response
        }, "*");
      })
      .catch((error) => {
        console.warn("forMaps Open bridge error", error);

        if (!message.requestId) {
          return;
        }

        window.postMessage({
          source: "formaps-open-extension",
          type: message.type === "settings-request" ? "settings-response" : "captcha-captured-response",
          requestId: message.requestId,
          response: {
            ok: false,
            error: error && error.message ? error.message : String(error)
          }
        }, "*");
      });
  });
})();
