function slugTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function encodeJsonDataUrl(value) {
  const json = JSON.stringify(value, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:application/json;base64,${btoa(binary)}`;
}

function downloadDataUrl(url, filename) {
  return chrome.downloads.download({
    url,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  });
}

const defaultQwenCaptchaEndpoint = "https://soul-pq-alpha.rainailab.com/api/qwen-captcha";
const hostedQwenCaptchaEndpoints = [
  "https://soul-pq-alpha.rainailab.com/api/qwen-captcha",
  "https://soul-pq-alpha-2.iggau.com/api/qwen-captcha"
];
const defaultSettings = {
  autoSubmitCaptchaSearch: false,
  autoSubmitDelaySeconds: 3
};

function normalizeSettings(value) {
  const delay = Number(value && value.autoSubmitDelaySeconds);

  return {
    autoSubmitCaptchaSearch: Boolean(value && value.autoSubmitCaptchaSearch),
    autoSubmitDelaySeconds: Number.isFinite(delay)
      ? Math.min(60, Math.max(0, Math.round(delay)))
      : defaultSettings.autoSubmitDelaySeconds
  };
}

async function getSettings() {
  const stored = await chrome.storage.local.get(defaultSettings);
  return normalizeSettings(stored);
}

function allowedQwenEndpoint(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
    const pqHosts = new Set(["soul-pq-alpha.rainailab.com", "soul-pq-alpha-2.iggau.com"]);
    const isLocalOrTailscale = localHosts.has(host) || isTailscaleIp(host) || host.endsWith(".ts.net");
    const isPqHosted = url.protocol === "https:" && pqHosts.has(host);
    const protocolAllowed = (url.protocol === "http:" && isLocalOrTailscale)
      || (url.protocol === "https:" && (isPqHosted || host.endsWith(".ts.net")));
    const hostAllowed = isLocalOrTailscale || isPqHosted;

    if (
      !protocolAllowed
      || !hostAllowed
      || url.pathname !== "/api/qwen-captcha"
    ) {
      return null;
    }

    return url.toString();
  } catch (error) {
    return null;
  }
}

function isTailscaleIp(host) {
  const parts = host.split(".");

  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number(part));

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

function qwenEndpointCandidates(metadata) {
  const configured = allowedQwenEndpoint(
    metadata && metadata.options ? metadata.options.qwenCaptchaEndpoint : null
  );
  const candidates = [
    configured,
    defaultQwenCaptchaEndpoint,
    ...hostedQwenCaptchaEndpoints,
    "http://127.0.0.1:4173/api/qwen-captcha",
    "http://localhost:4173/api/qwen-captcha"
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
}

async function readResponsePayload(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return { text };
  }
}

async function sendCaptchaToQwen(imageDataUrl, metadata) {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return {
      ok: false,
      skipped: true,
      error: "missing_image_data_url"
    };
  }

  const attempts = [];

  for (const endpoint of qwenEndpointCandidates(metadata)) {
    const startedAt = Date.now();

    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-formaps-open-extension": "1"
        },
        body: JSON.stringify({ imageDataUrl })
      }, 45000);
      const payload = await readResponsePayload(response);
      const attempt = {
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt
      };

      if (response.ok) {
        return {
          ok: true,
          ...attempt,
          response: payload
        };
      }

      return {
        ok: false,
        ...attempt,
        error: payload && payload.error ? payload.error : `http_${response.status}`,
        response: payload
      };
    } catch (error) {
      attempts.push({
        endpoint,
        durationMs: Date.now() - startedAt,
        error: error && error.name === "AbortError"
          ? "timeout"
          : error && error.message ? error.message : String(error)
      });
    }
  }

  return {
    ok: false,
    error: "qwen_proxy_unreachable",
    attempts
  };
}

async function captureVisibleTab(sender, filename) {
  if (!sender.tab || typeof sender.tab.windowId !== "number") {
    return { ok: false, error: "missing_sender_tab" };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "png"
    });
    await downloadDataUrl(dataUrl, filename);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.source !== "formaps-open-page") {
    return false;
  }

  if (message.type === "settings-request") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : String(error),
          settings: defaultSettings
        });
      });

    return true;
  }

  if (message.type !== "captcha-captured") {
    return false;
  }

  (async () => {
    const stamp = slugTimestamp();
    const basePath = `formaps-open/captcha-${stamp}`;
    const files = {
      image: `${basePath}.png`,
      metadata: `${basePath}.json`,
      viewport: `${basePath}-viewport.png`
    };
    const results = {
      files,
      image: null,
      metadata: null,
      viewport: null,
      qwen: null
    };
    const qwenPromise = sendCaptchaToQwen(message.imageDataUrl, message.metadata);

    if (typeof message.imageDataUrl === "string" && message.imageDataUrl.startsWith("data:image/")) {
      results.image = await downloadDataUrl(message.imageDataUrl, files.image);
    }

    results.qwen = await qwenPromise;
    results.viewport = await captureVisibleTab(sender, files.viewport);

    const metadata = {
      capturedAt: new Date().toISOString(),
      pageUrl: sender.tab ? sender.tab.url : null,
      captureVisibleTab: results.viewport,
      files,
      ...message.metadata,
      qwen: results.qwen
    };

    results.metadata = await downloadDataUrl(
      encodeJsonDataUrl(metadata),
      files.metadata
    );
    sendResponse({ ok: true, results });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  });

  return true;
});
