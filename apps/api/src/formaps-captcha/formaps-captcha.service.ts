import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type JsonRecord = Record<string, unknown>;

type ImageDimensions = {
  width: number;
  height: number;
};

type CaptchaTextDiagnostics = {
  captchaCode: string;
  looksLikeCaptcha: boolean;
  reason: string;
  parsedText: string;
  normalizedText: string;
  candidates: string[];
};

type CaptchaResult = {
  id: string | null;
  model: string;
  content: string | null;
  captchaCode: string;
  looksLikeCaptcha: boolean;
  reason: string;
  diagnostics: {
    promptVersion: string;
    image: {
      validDataUrl: boolean;
      mediaType: string | null;
      byteLength: number;
      dimensions: ImageDimensions | null;
    };
    text: {
      parsedText: string;
      normalizedText: string;
      candidates: string[];
      contentLength: number;
    };
  };
  finishReason: string | null;
  usage: unknown;
};

export const QWEN_CAPTCHA_REQUEST_HEADER = "x-formaps-open-extension";

const DEFAULT_NEURALWATT_API_URL = "https://api.neuralwatt.com/v1/chat/completions";
const DEFAULT_NEURALWATT_MODEL = "qwen3.6-35b-fast";
const DEFAULT_CAPTCHA_PROMPT =
  'You are an AI designed to test our captcha mechanisms. Answer only with JSON using this structure: {"text":"3HWYDL"}. Replace 3HWYDL with the exact characters visible in the captcha image. If no readable captcha code is visible, answer with {"text":""}.';
const COMMON_RESPONSE_WORDS = new Set(["CAPTCHA", "CODE", "JSON", "TEXT"]);

export class FormapsCaptchaHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

@Injectable()
export class FormapsCaptchaService {
  private readonly neuralwattApiUrl: string;
  private readonly neuralwattModel: string;
  private readonly captchaPrompt: string;

  constructor(private readonly config: ConfigService) {
    this.neuralwattApiUrl = optionalConfig(config.get<string>("NEURALWATT_API_URL")) ?? DEFAULT_NEURALWATT_API_URL;
    this.neuralwattModel = optionalConfig(config.get<string>("NEURALWATT_MODEL")) ?? DEFAULT_NEURALWATT_MODEL;
    this.captchaPrompt = optionalConfig(config.get<string>("NEURALWATT_CAPTCHA_PROMPT")) ?? DEFAULT_CAPTCHA_PROMPT;
  }

  extensionCorsHeaders(origin: unknown): Record<string, string> {
    const normalizedOrigin = Array.isArray(origin) ? origin[0] : origin;
    if (typeof normalizedOrigin !== "string" || !normalizedOrigin.startsWith("chrome-extension://")) {
      return {};
    }

    return {
      "Access-Control-Allow-Origin": normalizedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": `content-type, ${QWEN_CAPTCHA_REQUEST_HEADER}`,
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    };
  }

  async analyze(body: unknown): Promise<CaptchaResult> {
    const payload = isRecord(body) ? body : {};
    return this.analyzeCaptchaWithQwen(payload.imageDataUrl);
  }

  private async analyzeCaptchaWithQwen(imageDataUrl: unknown): Promise<CaptchaResult> {
    const apiKey = optionalConfig(this.config.get<string>("NEURALWATT_API_KEY"));
    if (!apiKey) {
      throw new FormapsCaptchaHttpError(500, "NEURALWATT_API_KEY non configurata");
    }

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      throw new FormapsCaptchaHttpError(400, "imageDataUrl deve essere una data:image URL");
    }

    const imageDiagnostics = inspectImageDataUrl(imageDataUrl);
    const response = await fetch(this.neuralwattApiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.neuralwattModel,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: this.captchaPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 512,
        temperature: 0,
      }),
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new FormapsCaptchaHttpError(response.status, "Neuralwatt request failed", compactErrorPayload(payload));
    }

    const payloadRecord = isRecord(payload) ? payload : {};
    const choice = firstRecord(payloadRecord.choices);
    const message = isRecord(choice?.message) ? choice.message : {};
    const content = normalizeModelContent(message.content);
    const textDiagnostics = analyzeCaptchaText(content);

    return {
      id: typeof payloadRecord.id === "string" ? payloadRecord.id : null,
      model: this.neuralwattModel,
      content,
      captchaCode: textDiagnostics.captchaCode,
      looksLikeCaptcha: textDiagnostics.looksLikeCaptcha,
      reason: textDiagnostics.reason,
      diagnostics: {
        promptVersion: "captcha-json-example-v2",
        image: imageDiagnostics,
        text: {
          parsedText: textDiagnostics.parsedText,
          normalizedText: textDiagnostics.normalizedText,
          candidates: textDiagnostics.candidates,
          contentLength: content ? content.length : 0,
        },
      },
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
      usage: payloadRecord.usage ?? null,
    };
  }
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readGifDimensions(buffer: Buffer): ImageDimensions | null {
  const signature = buffer.length >= 6 ? buffer.toString("ascii", 0, 6) : "";
  if (buffer.length < 10 || (signature !== "GIF87a" && signature !== "GIF89a")) {
    return null;
  }

  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    if (offset + 4 > buffer.length) {
      return null;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) {
      return null;
    }

    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function inspectImageDataUrl(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return {
      validDataUrl: false,
      mediaType: null,
      byteLength: 0,
      dimensions: null,
    };
  }

  const buffer = Buffer.from(match[2], "base64");
  return {
    validDataUrl: true,
    mediaType: match[1],
    byteLength: buffer.length,
    dimensions: readPngDimensions(buffer) ?? readGifDimensions(buffer) ?? readJpegDimensions(buffer),
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function compactErrorPayload(payload: unknown) {
  if (!payload) return null;
  if (isRecord(payload) && payload.error) return payload.error;
  if (isRecord(payload) && typeof payload.text === "string") return payload.text.slice(0, 2000);
  return payload;
}

function stripMarkdownJsonFence(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonLikeText(value: unknown) {
  const text = stripMarkdownJsonFence(value);
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string") return parsed;
    if (isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, "text")) {
      return String(parsed.text ?? "");
    }
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]) as unknown;
        if (isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, "text")) {
          return String(parsed.text ?? "");
        }
      } catch {
        return text;
      }
    }
  }

  return text;
}

function normalizeCaptchaCode(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function looksLikeCaptchaCode(value: unknown) {
  return /^[A-Z0-9]{4,8}$/.test(String(value ?? ""));
}

function analyzeCaptchaText(value: unknown): CaptchaTextDiagnostics {
  const parsedText = parseJsonLikeText(value);
  const normalizedText = normalizeCaptchaCode(parsedText);

  if (looksLikeCaptchaCode(normalizedText) && !COMMON_RESPONSE_WORDS.has(normalizedText)) {
    return {
      captchaCode: normalizedText,
      looksLikeCaptcha: true,
      reason: "valid_normalized_text",
      parsedText,
      normalizedText,
      candidates: [normalizedText],
    };
  }

  const candidates = String(parsedText)
    .toUpperCase()
    .match(/[A-Z0-9]{4,8}/g) ?? [];
  const filteredCandidates = candidates.filter((candidate) => looksLikeCaptchaCode(candidate) && !COMMON_RESPONSE_WORDS.has(candidate));
  const captchaCode = [...filteredCandidates].reverse()[0] ?? "";

  return {
    captchaCode,
    looksLikeCaptcha: Boolean(captchaCode),
    reason: captchaCode ? "valid_candidate_token" : parsedText ? "no_plausible_captcha_code" : "empty_model_text",
    parsedText,
    normalizedText,
    candidates: filteredCandidates,
  };
}

function normalizeModelContent(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;
  return JSON.stringify(value) ?? String(value);
}

function firstRecord(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return isRecord(first) ? first : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalConfig(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}
