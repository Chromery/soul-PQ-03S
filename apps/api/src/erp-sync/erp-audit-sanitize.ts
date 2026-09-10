import { createHash } from "node:crypto";

const secretKey = /authorization|cookie|password|passwd|secret|token|apikey|credential|signature/i;
const normalize = (key: string) => key.replace(/[^a-z0-9]/gi, "");
const binaryKey = /base64|^(filecontent|filedata|binary|bytes|buffer|pdfcontent|pdfdata)$/i;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Preserve business values and document metadata, never binary attachments or credentials.
// Limits are explicit in the output rather than silently dropping the end of a payload.
export function sanitizeErpAudit(value: unknown, knownSecrets: string[] = [], maxBytes = 1024 * 1024) {
  let remaining = maxBytes, nodes = 0, truncated = false;
  const seen = new WeakSet<object>();
  function cleanString(value: string) {
    for (const secret of knownSecrets) if (secret) value = value.replaceAll(secret, "[REDACTED]");
    value = value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");
    // Signed URLs can occur inside notes as well as dedicated document fields.
    return value.replace(/https?:\/\/[^\s<>"']+/gi, raw => {
      try {
        const url = new URL(raw);
        if (url.username || url.password) { url.username = "REDACTED"; url.password = ""; }
        for (const key of [...url.searchParams.keys()]) {
          if (secretKey.test(normalize(key)) || /^(key|sig|auth)$/i.test(key)) url.searchParams.set(key, "[REDACTED]");
        }
        return url.toString();
      } catch { return "[INVALID_URL]"; }
    });
  }
  function visit(input: unknown, key: string, depth: number): unknown {
    if (remaining <= 0 || ++nodes > 50000 || depth > 30) { truncated = true; return "[TRUNCATED]"; }
    remaining -= 16;
    if (secretKey.test(normalize(key))) return "[REDACTED]";
    if (binaryKey.test(normalize(key)) && input !== null && typeof input !== "string") return { omitted: "attachment_content" };
    if (typeof input === "string") {
      if (binaryKey.test(normalize(key)) || /^(data:|%PDF-|JVBERi0)/i.test(input) || (input.length >= 256 && /^[A-Za-z0-9+/=\r\n]+$/.test(input))) {
        return { omitted: "attachment_content", encodedCharacters: input.length, encodedSha256: sha256(input) };
      }
      const cleaned = cleanString(input);
      const bytes = Buffer.byteLength(cleaned);
      if (bytes > remaining) { truncated = true; remaining = 0; return { omitted: "size_limit", characters: input.length }; }
      remaining -= bytes;
      return cleaned;
    }
    if (input === null || typeof input === "boolean" || typeof input === "number") return input;
    if (!input || typeof input !== "object") return null;
    if (Buffer.isBuffer(input)) return { omitted: "attachment_content", bytes: input.length };
    if (seen.has(input)) return "[CIRCULAR]";
    seen.add(input);
    if (Array.isArray(input)) {
      const result = [];
      for (const item of input) {
        if (remaining <= 0 || nodes > 50000) { truncated = true; result.push("[TRUNCATED]"); break; }
        result.push(visit(item, key, depth + 1));
      }
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const [childKey, item] of Object.entries(input)) {
      if (remaining <= 0 || nodes > 50000) { truncated = true; result.__audit_truncated = true; break; }
      if (childKey.length > 240) { truncated = true; result.__audit_long_key_omitted = true; continue; }
      remaining -= Buffer.byteLength(childKey);
      result[childKey] = visit(item, childKey, depth + 1);
    }
    return result;
  }
  const body = visit(value, "", 0);
  return { body, truncated };
}
