import { BadRequestException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";

export function assertStorageKey(key: string) {
  if (!key || key.length > 1024 || /[\\\x00-\x1f\x7f]/.test(key) ||
      /%2e|%2f|%5c/i.test(key) || key.split("/").some(p => !p || p === "." || p === "..") ||
      /^(?:backups?|secrets|credentials)(?:\/|$)/i.test(key)) {
    throw new BadRequestException("Chiave storage non valida per un documento");
  }
}

export function assertDocumentStorageKey(key: string, prefix: string) {
  assertStorageKey(key);
  assertStorageKey(prefix);
  if (!key.startsWith(prefix + "/")) throw new BadRequestException("Documento esterno al namespace di questo ambiente");
}

export async function decodePdfUpload(value: string) {
  const maxBytes = 40 * 1024 * 1024;
  if (value.length > Math.ceil(maxBytes * 4 / 3) + 4096) throw new BadRequestException("PDF troppo grande (massimo 40 MiB)");
  let payload = value;
  if (value.startsWith("data:")) {
    const match = /^data:application\/pdf;base64,([\s\S]*)$/i.exec(value);
    if (!match) throw new BadRequestException("Data URI PDF non valido");
    payload = match[1];
  }
  payload = payload.replace(/\s/g, "");
  if (!payload || !/^[a-zA-Z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    throw new BadRequestException("Contenuto base64 non valido");
  }
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length > maxBytes || bytes.toString("base64").replace(/=+$/, "") !== payload.replace(/=+$/, "") ||
      !/%PDF-[12]\.\d/.test(bytes.subarray(0, 1024).toString("latin1")) ||
      !bytes.subarray(Math.max(0, bytes.length - 4096)).includes(Buffer.from("%%EOF"))) {
    throw new BadRequestException("Il file non è un PDF completo e valido (massimo 40 MiB)");
  }
  try {
    const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
    if (pdf.getPageCount() < 1 || pdf.getPageCount() > 500) throw new Error("page limit");
  } catch {
    throw new BadRequestException("PDF non leggibile, protetto o con oltre 500 pagine");
  }
  return bytes;
}

export function safeStoragePart(value: string) {
  const result = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!result || result === "." || result === "..") throw new BadRequestException("Identificativo documento non valido");
  return result;
}
