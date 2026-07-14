(function formapsOpenContentScript() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const encodedPayload = hashParams.get("formapsOpen");

  if (!encodedPayload || window.__formapsOpenStarted) {
    return;
  }

  window.__formapsOpenStarted = true;

  function decodePayload(payload) {
    let base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitFor(label, getValue, timeoutMs = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const value = getValue();
      if (value) {
        return value;
      }

      await sleep(150);
    }

    throw new Error(`Timeout: ${label}`);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function compact(value) {
    return normalize(value).replace(/[\s.]/g, "");
  }

  const fallbackCatasto = {
    provincia: "Agrigento",
    comune: "Agrigento"
  };
  const defaultSettings = {
    autoSubmitCaptchaSearch: false,
    autoSubmitDelaySeconds: 3
  };

  function makePanel() {
    const panel = document.createElement("div");
    panel.id = "formaps-open-status";
    panel.style.position = "fixed";
    panel.style.top = "76px";
    panel.style.right = "24px";
    panel.style.zIndex = "2147483647";
    panel.style.maxWidth = "360px";
    panel.style.padding = "10px 12px";
    panel.style.borderRadius = "12px";
    panel.style.background = "#1f2428";
    panel.style.color = "#fff";
    panel.style.font = "13px/1.45 Arial, Helvetica, sans-serif";
    panel.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.22)";
    panel.style.transition = "max-width 160ms ease, padding 160ms ease, background 160ms ease";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";

    const title = document.createElement("strong");
    title.textContent = "forMaps Open";
    title.style.fontSize = "12px";
    title.style.letterSpacing = "0.02em";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "−";
    toggle.title = "Comprimi stato forMaps Open";
    toggle.setAttribute("aria-label", "Comprimi stato forMaps Open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.style.width = "24px";
    toggle.style.height = "24px";
    toggle.style.flex = "0 0 auto";
    toggle.style.display = "grid";
    toggle.style.placeItems = "center";
    toggle.style.padding = "0";
    toggle.style.border = "1px solid rgba(255, 255, 255, 0.24)";
    toggle.style.borderRadius = "7px";
    toggle.style.color = "#fff";
    toggle.style.background = "rgba(255, 255, 255, 0.08)";
    toggle.style.font = "bold 16px/1 Arial, Helvetica, sans-serif";
    toggle.style.cursor = "pointer";

    const message = document.createElement("div");
    message.textContent = "Avvio automazione...";
    message.style.marginTop = "6px";
    message.style.maxWidth = "336px";

    let collapsed = false;
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      collapsed = !collapsed;
      message.hidden = collapsed;
      toggle.textContent = collapsed ? "+" : "−";
      toggle.title = collapsed ? "Espandi stato forMaps Open" : "Comprimi stato forMaps Open";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      panel.style.padding = collapsed ? "7px 8px" : "10px 12px";
      panel.style.maxWidth = collapsed ? "150px" : "360px";
    });

    header.append(title, toggle);
    panel.append(header, message);
    document.documentElement.append(panel);
    return { panel, message };
  }

  const panelUi = makePanel();
  const panel = panelUi.panel;

  function setStatus(message, tone = "info") {
    panelUi.message.textContent = message;
    panel.style.background = tone === "error" ? "#8a1f11" : tone === "warn" ? "#7a5400" : "#1f2428";
  }

  async function fetchJsonp(path, params) {
    const callback = `__formapsOpenJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const url = new URL(path, "https://www.formaps.it/WS/DatiCatastali/");

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set("callback", callback);
    url.searchParams.set("_", String(Date.now()));

    const response = await fetch(url.toString(), {
      credentials: "include",
      cache: "no-store"
    });
    const text = await response.text();
    const firstParen = text.indexOf("(");
    const lastParen = text.lastIndexOf(")");

    if (!response.ok || firstParen === -1 || lastParen === -1) {
      throw new Error(`Risposta non valida da forMaps: ${path}`);
    }

    return JSON.parse(text.slice(firstParen + 1, lastParen));
  }

  function chooseBest(items, label) {
    const wanted = normalize(label);
    const wantedCompact = compact(label);

    return items.find((item) => normalize(item.text) === wanted)
      || items.find((item) => compact(item.text) === wantedCompact)
      || items.find((item) => normalize(item.text).includes(wanted))
      || items.find((item) => wanted.includes(normalize(item.text)));
  }

  async function findProvince(label) {
    const data = await fetchJsonp("GetProvinceCatastali", { term: label });
    const items = data.items || [];

    return {
      item: chooseBest(items, label) || null,
      firstItem: items[0] || null,
      itemCount: items.length
    };
  }

  async function findComune(provinceId, label) {
    const attempts = [label, label.split("/")[0]];

    for (const term of attempts) {
      const data = await fetchJsonp("GetComuniCatastali", {
        idProvincia: provinceId,
        term
      });
      const items = data.items || [];
      const item = chooseBest(items, label);

      if (item) {
        return {
          item,
          firstItem: items[0] || null,
          itemCount: items.length,
          term
        };
      }
    }

    return {
      item: null,
      firstItem: null,
      itemCount: 0,
      term: attempts[attempts.length - 1]
    };
  }

  async function resolveFallbackProvince() {
    const fallback = await findProvince(fallbackCatasto.provincia);
    const item = fallback.item || fallback.firstItem;

    if (!item) {
      throw new Error(`Provincia fallback non trovata: ${fallbackCatasto.provincia}`);
    }

    return item;
  }

  async function resolveFallbackComune(provinceId) {
    const fallback = await findComune(provinceId, fallbackCatasto.comune);
    const item = fallback.item || fallback.firstItem;

    if (!item) {
      throw new Error(`Comune fallback non trovato: ${fallbackCatasto.comune}`);
    }

    return item;
  }

  function fallbackMessage(selectionFallbacks) {
    if (selectionFallbacks.length === 0) {
      return "";
    }

    const labels = selectionFallbacks
      .map((fallback) => `${fallback.type} "${fallback.requested}"`)
      .join(", ");

    return `${labels} non trovati; uso ${fallbackCatasto.provincia}/${fallbackCatasto.comune}.`;
  }

  async function setSelect2Value(jQuery, element, item) {
    const field = jQuery(element);
    await waitFor(`${element.id} select2`, () => field.data("select2"), 15000);

    field.select2("data", item, true);
    await sleep(700);
  }

  function setInputValue(element, value) {
    element.disabled = false;
    element.focus();
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "0" }));
  }

  function elementActionText(element) {
    return normalize(
      element.textContent
      || element.value
      || element.title
      || element.getAttribute("aria-label")
      || element.id
      || ""
    );
  }

  function captchaConfirmButton(suffix) {
    const captchaContainer = document.querySelector(`#forMapsCatasto_captchaContainer${suffix}`);
    const selectors = [
      `#forMapsCatasto_conferma${suffix}`,
      `#forMapsCatasto_confermaCaptcha${suffix}`,
      `#forMapsCatasto_verificaCodice${suffix}`,
      `#forMapsCatasto_verificaCaptcha${suffix}`,
      `#forMapsCatasto_codiceVerificaConferma${suffix}`
    ];
    const direct = selectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);

    if (direct) {
      return direct;
    }

    const candidates = [
      ...(captchaContainer ? captchaContainer.querySelectorAll("button, input[type=button], input[type=submit], a") : []),
      ...document.querySelectorAll("button, input[type=button], input[type=submit], a")
    ];

    return candidates.find((element) => {
      const text = elementActionText(element);
      return text === "CONFERMA" || text.includes("CONFERMA");
    }) || null;
  }

  async function submitCaptchaConfirmation(suffix, captchaInput) {
    const submitButton = captchaConfirmButton(suffix);

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.click();
      return true;
    }

    if (captchaInput) {
      captchaInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      captchaInput.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key: "Enter" }));
      captchaInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
      return true;
    }

    return false;
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null;
  }

  function elementSnapshot(element) {
    if (!element) {
      return { exists: false };
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      exists: true,
      id: element.id || null,
      className: typeof element.className === "string" ? element.className : null,
      visible: isVisible(element),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      offsetParent: Boolean(element.offsetParent),
      rect: {
        x: rect.x,
        y: rect.y,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    };
  }

  function dataUrlSnapshot(value) {
    const match = String(value || "").match(/^data:([^;,]+);base64,/);

    return {
      exists: Boolean(value),
      mediaType: match ? match[1] : null,
      length: value ? value.length : 0
    };
  }

  function imageDiagnostics(image, imageDataUrl) {
    return {
      dataUrl: dataUrlSnapshot(imageDataUrl),
      complete: image ? Boolean(image.complete) : false,
      naturalWidth: image && typeof image.naturalWidth === "number" ? image.naturalWidth : null,
      naturalHeight: image && typeof image.naturalHeight === "number" ? image.naturalHeight : null,
      currentSrcLength: image && image.currentSrc ? image.currentSrc.length : 0
    };
  }

  function nextRequestId() {
    return `captcha_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function waitForExtensionResponse(requestId, type, timeoutMs = 70000) {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`Timeout risposta estensione: ${type}`));
      }, timeoutMs);

      function onMessage(event) {
        if (event.source !== window) {
          return;
        }

        const message = event.data;

        if (
          !message
          || message.source !== "formaps-open-extension"
          || message.type !== type
          || message.requestId !== requestId
        ) {
          return;
        }

        window.clearTimeout(timeoutId);
        window.removeEventListener("message", onMessage);
        resolve(message.response);
      }

      window.addEventListener("message", onMessage);
    });
  }

  function waitForCaptchaResponse(requestId, timeoutMs = 70000) {
    return waitForExtensionResponse(requestId, "captcha-captured-response", timeoutMs);
  }

  function normalizeSettings(value) {
    const delay = Number(value && value.autoSubmitDelaySeconds);

    return {
      autoSubmitCaptchaSearch: Boolean(value && value.autoSubmitCaptchaSearch),
      autoSubmitDelaySeconds: Number.isFinite(delay)
        ? Math.min(60, Math.max(0, Math.round(delay)))
        : defaultSettings.autoSubmitDelaySeconds
    };
  }

  async function getExtensionSettings() {
    const requestId = nextRequestId();
    const responsePromise = waitForExtensionResponse(requestId, "settings-response", 5000);

    window.postMessage({
      source: "formaps-open-page",
      type: "settings-request",
      requestId
    }, "*");

    const response = await responsePromise;

    if (!response || response.ok === false) {
      return defaultSettings;
    }

    return normalizeSettings(response.settings);
  }

  function stripMarkdownJsonFence(value) {
    return String(value || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  function parseQwenText(value) {
    const text = stripMarkdownJsonFence(value);

    if (!text) {
      return "";
    }

    try {
      const parsed = JSON.parse(text);

      if (typeof parsed === "string") {
        return parsed.trim();
      }

      if (parsed && typeof parsed.text !== "undefined") {
        return String(parsed.text || "").trim();
      }
    } catch (error) {
      const objectMatch = text.match(/\{[\s\S]*\}/);

      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);

          if (parsed && typeof parsed.text !== "undefined") {
            return String(parsed.text || "").trim();
          }
        } catch (nestedError) {
          return text;
        }
      }
    }

    return text;
  }

  function normalizeCaptchaCode(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function looksLikeCaptchaCode(value) {
    return /^[A-Z0-9]{4,8}$/.test(String(value || ""));
  }

  function isCommonResponseWord(value) {
    return new Set([
      "CAPTCHA",
      "CODE",
      "JSON",
      "TEXT"
    ]).has(String(value || ""));
  }

  function extractCaptchaCodeFromText(value) {
    const text = parseQwenText(value);
    const normalized = normalizeCaptchaCode(text);

    if (looksLikeCaptchaCode(normalized)) {
      return normalized;
    }

    const candidates = String(text || "")
      .toUpperCase()
      .match(/[A-Z0-9]{4,8}/g) || [];

    return candidates
      .reverse()
      .find((candidate) => looksLikeCaptchaCode(candidate) && !isCommonResponseWord(candidate)) || "";
  }

  function extractQwenResult(captureResponse) {
    const qwen = captureResponse && captureResponse.results
      ? captureResponse.results.qwen
      : captureResponse && captureResponse.qwen ? captureResponse.qwen : null;

    return qwen
      && qwen.response
      && qwen.response.result
      ? qwen.response.result
      : null;
  }

  function extractQwenEnvelope(captureResponse) {
    return captureResponse && captureResponse.results
      ? captureResponse.results.qwen
      : captureResponse && captureResponse.qwen ? captureResponse.qwen : null;
  }

  function extractCodiceVerificaInput(captureResponse) {
    const result = extractQwenResult(captureResponse);

    if (!result) {
      return "";
    }

    if (result.looksLikeCaptcha && looksLikeCaptchaCode(result.captchaCode)) {
      return result.captchaCode;
    }

    return extractCaptchaCodeFromText(result.content);
  }

  function buildCaptchaTroubleshooting(captureResponse, codiceVerificaInput) {
    const qwen = extractQwenEnvelope(captureResponse);
    const result = extractQwenResult(captureResponse);
    const files = captureResponse && captureResponse.results ? captureResponse.results.files : null;
    const details = {
      reason: "unknown",
      metadataFile: files ? files.metadata : null,
      qwen,
      result,
      extractedCode: codiceVerificaInput || ""
    };

    if (!captureResponse) {
      details.reason = "no_extension_response";
      return details;
    }

    if (captureResponse.ok === false) {
      details.reason = captureResponse.error || "extension_response_error";
      return details;
    }

    if (!qwen) {
      details.reason = "missing_qwen_result";
      return details;
    }

    if (qwen.skipped) {
      details.reason = qwen.error || "qwen_skipped";
      return details;
    }

    if (!qwen.ok) {
      details.reason = qwen.error || "qwen_request_failed";
      return details;
    }

    if (!result) {
      details.reason = "missing_qwen_payload";
      return details;
    }

    details.reason = result.reason || "no_plausible_captcha_code";
    return details;
  }

  function troubleshootingStatus(details) {
    const fileHint = details.metadataFile ? ` Dettagli: Downloads/${details.metadataFile}.` : "";
    return `${details.reason}.${fileHint}`;
  }

  async function captureCaptcha(suffix, entry, options, phase) {
    const container = document.querySelector(`#forMapsCatasto_captchaContainer${suffix}`);
    const image = document.querySelector(`#forMapsCatasto_codiceVerifica${suffix}`);
    const input = document.querySelector(`#forMapsCatasto_codiceVerificaInput${suffix}`);
    const catCard = document.querySelector(`#forMapsCatasto_ricercaFogliParticelle${suffix}`);
    const catPanel = catCard ? catCard.closest(".forMapsTabs, .sidebar, [class*=sidebar]") : null;
    const imageDataUrl = image && image.src && image.src.startsWith("data:image/") ? image.src : null;
    const requestId = nextRequestId();
    const responsePromise = waitForCaptchaResponse(requestId);

    window.postMessage({
      source: "formaps-open-page",
      type: "captcha-captured",
      requestId,
      imageDataUrl,
      metadata: {
        phase,
        suffix,
        entry,
        options,
        href: window.location.href,
        hasImageDataUrl: Boolean(imageDataUrl),
        imageDataUrlLength: imageDataUrl ? imageDataUrl.length : 0,
        imageDiagnostics: imageDiagnostics(image, imageDataUrl),
        container: elementSnapshot(container),
        image: elementSnapshot(image),
        input: elementSnapshot(input),
        catCard: elementSnapshot(catCard),
        catPanel: elementSnapshot(catPanel)
      }
    }, "*");

    return responsePromise;
  }

  function hasLayoutBox(element) {
    return Boolean(element && element.isConnected && element.getClientRects().length > 0);
  }

  function catastoTabList() {
    const lists = [...document.querySelectorAll('ul.forMapsFunctions[role="tablist"], ul.forMapsFunctions')];
    return lists.find(hasLayoutBox) || lists[0] || null;
  }

  function catastoTabElements() {
    const list = catastoTabList();
    const tab = list
      ? list.querySelector('li.catTab') || list.querySelector("li:nth-child(2)")
      : document.querySelector("li.catTab");
    const link = tab
      ? tab.querySelector('a[title="Catasto ordinario"], a[role="tab"], a')
      : document.querySelector('.catTab > a[title="Catasto ordinario"], .catTab > a');

    return {
      list,
      tab,
      link
    };
  }

  function catastoTabLink() {
    return catastoTabElements().link;
  }

  function forceVisible(element) {
    if (!element || !element.style) {
      return;
    }

    element.hidden = false;
    element.removeAttribute("hidden");
    element.setAttribute("aria-hidden", "false");
    element.classList.remove("hide", "hidden", "collapsed");
    element.classList.add("show", "in");

    const style = window.getComputedStyle(element);

    if (style.display === "none") {
      element.style.setProperty("display", "block", "important");
    }

    if (style.visibility === "hidden") {
      element.style.setProperty("visibility", "visible", "important");
    }

    if (style.opacity === "0") {
      element.style.setProperty("opacity", "1", "important");
    }

    if (style.height === "0px" && element.scrollHeight > 0) {
      element.style.setProperty("min-height", `${Math.min(520, element.scrollHeight)}px`, "important");
    }

    if (style.width === "0px" && element.scrollWidth > 0) {
      element.style.setProperty("min-width", `${Math.min(520, element.scrollWidth)}px`, "important");
    }
  }

  function forceVisibleChain(element) {
    let current = element;

    while (current && current !== document.documentElement) {
      forceVisible(current);
      current = current.parentElement;
    }
  }

  function forceShowCatastoPanel(suffix, link) {
    const anchor = link || catastoTabLink();
    const tab = anchor ? anchor.closest("li") : null;
    const paneSelector = anchor ? anchor.getAttribute("href") : null;
    const pane = paneSelector && paneSelector.startsWith("#") ? document.querySelector(paneSelector) : null;
    const catCard = suffix
      ? document.querySelector(`#forMapsCatasto_ricercaFogliParticelle${suffix}`)
      : document.querySelector('[id^="forMapsCatasto_ricercaFogliParticelle"]');
    const provinceField = suffix
      ? document.querySelector(`#forMapsCatasto_provinceCatastali${suffix}`)
      : document.querySelector('[id^="forMapsCatasto_provinceCatastali"]');

    if (tab) {
      const siblings = tab.parentElement ? [...tab.parentElement.children] : [];

      siblings.forEach((sibling) => {
        if (sibling !== tab) {
          sibling.classList.remove("active");
        }
      });
      tab.classList.add("active");
    }

    if (anchor) {
      const siblingLinks = tab && tab.parentElement ? [...tab.parentElement.querySelectorAll('a[role="tab"]')] : [];

      siblingLinks.forEach((sibling) => sibling.setAttribute("aria-selected", sibling === anchor ? "true" : "false"));
      anchor.setAttribute("aria-selected", "true");
    }

    if (pane) {
      const siblingPanes = pane.parentElement ? [...pane.parentElement.children] : [];

      siblingPanes.forEach((sibling) => {
        if (sibling !== pane && sibling.id && sibling.id.toLowerCase().includes("pane")) {
          sibling.classList.remove("active", "in", "show");
        }
      });
      pane.classList.add("active", "in", "show");
      pane.style.setProperty("display", "block", "important");
      forceVisibleChain(pane);
    }

    if (catCard) {
      forceVisibleChain(catCard);
      catCard.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (provinceField) {
      forceVisibleChain(provinceField);
      provinceField.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function isCatastoPaneOpen(link) {
    const anchor = link || catastoTabLink();
    const tab = anchor ? anchor.closest("li") : null;
    const paneSelector = anchor ? anchor.getAttribute("href") : null;
    const pane = paneSelector && paneSelector.startsWith("#") ? document.querySelector(paneSelector) : null;
    const catCard = document.querySelector('[id^="forMapsCatasto_ricercaFogliParticelle"]');
    const provinceField = document.querySelector('[id^="forMapsCatasto_provinceCatastali"]');

    return Boolean(
      pane && isVisible(pane)
      || catCard && isVisible(catCard)
      || provinceField && isVisible(provinceField)
      || pane && pane.classList.contains("active") && tab && tab.classList.contains("active")
    );
  }

  function dispatchClickSequence(element) {
    const options = {
      bubbles: true,
      cancelable: true,
      view: window
    };

    element.focus({ preventScroll: true });
    element.dispatchEvent(new MouseEvent("mouseover", options));
    element.dispatchEvent(new MouseEvent("mouseenter", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
  }

  function clickCatastoTab() {
    const { list, tab, link } = catastoTabElements();

    if (!tab && !link) {
      return false;
    }

    if (link) {
      link.scrollIntoView({ block: "nearest", inline: "nearest" });
      link.click();
      dispatchClickSequence(link);
    }

    if (tab) {
      tab.click();
      dispatchClickSequence(tab);
    }

    if (window.jQuery) {
      try {
        if (link) {
          window.jQuery(link).trigger("click");
        }

        if (tab) {
          window.jQuery(tab).trigger("click");
        }

        if (list && window.jQuery.fn && typeof window.jQuery.fn.tabs === "function") {
          window.jQuery(list).tabs("option", "active", 1);
        }

        if (link && window.jQuery.fn && typeof window.jQuery.fn.tab === "function") {
          window.jQuery(link).tab("show");
        }
      } catch (error) {
        // I trigger nativi sopra restano il percorso principale.
      }
    }

    forceShowCatastoPanel(null, link);

    return isCatastoPaneOpen(link);
  }

  async function run() {
    const payload = decodePayload(encodedPayload);
    const entry = payload.entry || {};
    const options = {
      captureCaptcha: true,
      ...(payload.options || {}),
      openCatPanel: true
    };
    const selectionFallbacks = [];
    options.selectionFallbacks = selectionFallbacks;
    const settings = await getExtensionSettings().catch(() => defaultSettings);
    options.extensionSettings = settings;

    setStatus("attendo caricamento mappa...");
    clickCatastoTab();

    const jQuery = await waitFor("jQuery/select2", () => {
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
        return window.jQuery;
      }

      return null;
    }, 60000);

    setStatus("apro pannello CAT...");
    await waitFor("tab CAT attivo", () => clickCatastoTab(), 15000);

    const provinceElement = await waitFor(
      "campo provincia catastale",
      () => document.querySelector('[id^="forMapsCatasto_provinceCatastali"]'),
      60000
    );
    const suffix = provinceElement.id.replace("forMapsCatasto_provinceCatastali", "");
    forceShowCatastoPanel(suffix);

    setStatus("seleziono provincia catastale...");
    const provinceLookup = await findProvince(entry.provincia).catch((error) => ({
      item: null,
      firstItem: null,
      itemCount: 0,
      error: error && error.message ? error.message : String(error)
    }));
    let province = provinceLookup.item;
    let usingFallbackProvince = false;

    if (!province) {
      selectionFallbacks.push({
        type: "provincia",
        requested: entry.provincia,
        reason: provinceLookup.error || "not_found",
        itemCount: provinceLookup.itemCount || 0
      });
      province = await resolveFallbackProvince();
      usingFallbackProvince = true;
      setStatus(`${fallbackMessage(selectionFallbacks)} Continuo con gli altri campi...`, "warn");
    }

    await setSelect2Value(jQuery, provinceElement, province);

    setStatus("seleziono comune catastale...");
    const comuneElement = await waitFor(
      "campo comune catastale",
      () => document.querySelector(`#forMapsCatasto_comuniCatastali${suffix}`),
      15000
    );
    forceShowCatastoPanel(suffix);
    let comune = null;

    if (!usingFallbackProvince) {
      const comuneLookup = await findComune(province.id, entry.comune).catch((error) => ({
        item: null,
        firstItem: null,
        itemCount: 0,
        error: error && error.message ? error.message : String(error)
      }));
      comune = comuneLookup.item;

      if (!comune) {
        selectionFallbacks.push({
          type: "comune",
          requested: entry.comune,
          reason: comuneLookup.error || "not_found",
          itemCount: comuneLookup.itemCount || 0
        });
      }
    }

    if (!comune) {
      const fallbackProvince = usingFallbackProvince ? province : await resolveFallbackProvince();

      if (!usingFallbackProvince && fallbackProvince.id !== province.id) {
        province = fallbackProvince;
        usingFallbackProvince = true;
        await setSelect2Value(jQuery, provinceElement, province);
      }

      comune = await resolveFallbackComune(province.id);
      setStatus(`${fallbackMessage(selectionFallbacks)} Continuo con gli altri campi...`, "warn");
    }

    await setSelect2Value(jQuery, comuneElement, comune);

    const foglioElement = await waitFor(
      "campo foglio",
      () => document.querySelector(`#forMapsCatasto_fogliCatastali${suffix}`),
      15000
    );
    const particellaElement = await waitFor(
      "campo particella",
      () => document.querySelector(`#forMapsCatasto_particelleCatastali${suffix}`),
      15000
    );

    setStatus(selectionFallbacks.length > 0 ? `${fallbackMessage(selectionFallbacks)} Inserisco foglio e particella originali...` : "inserisco foglio e particella...", selectionFallbacks.length > 0 ? "warn" : "info");
    await waitFor("campi catastali abilitati", () => !foglioElement.disabled && !particellaElement.disabled, 8000)
      .catch(() => true);
    setInputValue(foglioElement, entry.foglio);
    setInputValue(particellaElement, entry.particella);

    const searchButton = await waitFor(
      "pulsante cerca particella",
      () => document.querySelector(`#forMapsCatasto_cercaParticella${suffix}`),
      15000
    );

    setStatus(selectionFallbacks.length > 0 ? `${fallbackMessage(selectionFallbacks)} Clicco cerca particella...` : "clicco cerca particella...", selectionFallbacks.length > 0 ? "warn" : "info");
    searchButton.disabled = false;
    if (options.openCatPanel) {
      searchButton.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    searchButton.click();

    const captchaImage = await waitFor(
      "immagine captcha",
      () => {
        const image = document.querySelector(`#forMapsCatasto_codiceVerifica${suffix}`);
        return image && image.src && image.src.startsWith("data:image/") ? image : null;
      },
      10000
    ).catch(() => null);

    const captcha = document.querySelector(`#forMapsCatasto_captchaContainer${suffix}`);
    if (captchaImage || isVisible(captcha)) {
      let captureResponse = null;

      if (options.captureCaptcha) {
        setStatus("captcha catturato; invio immagine a Qwen...", "warn");
        captureResponse = await captureCaptcha(
          suffix,
          entry,
          options,
          captchaImage ? "captcha-image-found" : "captcha-container-found"
        );
      }

      const visibility = isVisible(captcha) ? "visibile" : "non visibile";
      const codiceVerificaInput = extractCodiceVerificaInput(captureResponse);
      const captchaInput = document.querySelector("#forMapsCatasto_codiceVerificaInput931427")
        || document.querySelector(`#forMapsCatasto_codiceVerificaInput${suffix}`);

      if (captchaInput && looksLikeCaptchaCode(codiceVerificaInput)) {
        setInputValue(captchaInput, codiceVerificaInput);

        if (settings.autoSubmitCaptchaSearch) {
          const delaySeconds = normalizeSettings(settings).autoSubmitDelaySeconds;

          setStatus(`captcha compilato (${visibility}). Conferma automatica tra ${delaySeconds}s...`, "warn");
          await sleep(delaySeconds * 1000);
          const submitted = await submitCaptchaConfirmation(suffix, captchaInput);

          if (submitted) {
            setStatus("captcha confermato.");
            window.setTimeout(() => panel.remove(), 6000);
          } else {
            setStatus("captcha compilato, ma non trovo il pulsante Conferma.", "error");
          }

          return;
        }

        setStatus(`captcha compilato (${visibility}). Premi Conferma per continuare.`, "warn");
        return;
      }

      if (captchaInput) {
        captchaInput.focus();
      }

      const troubleshooting = buildCaptchaTroubleshooting(captureResponse, codiceVerificaInput);
      console.warn("forMaps Open CAPTCHA troubleshooting", troubleshooting);
      setStatus(
        `captcha catturato (${visibility}), ma Qwen non ha restituito un codice leggibile: ${troubleshootingStatus(troubleshooting)}`,
        "error"
      );
      return;
    }

    setStatus("ricerca inviata.");
    window.setTimeout(() => panel.remove(), 6000);
  }

  run().catch((error) => {
    console.error(error);
    setStatus(error.message || "errore durante l'automazione.", "error");
  });
})();
