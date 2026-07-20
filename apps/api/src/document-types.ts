import { BadRequestException } from "@nestjs/common";
import { DocumentType } from "./generated/prisma/enums.js";

export function parseDocumentType(value: string) {
  const normalized = value.toLowerCase();
  if (
    normalized === "planimetria"
    || normalized === "elaborato"
    || normalized === "elaborato_planimetrico"
  ) {
    return DocumentType.PLANIMETRIA;
  }
  if (normalized === "visura" || normalized === "visura_catastale") return DocumentType.VISURA;
  if (
    normalized === "elenco_subalterni"
    || normalized === "elenco_dei_subalterni"
    || normalized === "subalterni"
  ) {
    return DocumentType.ELENCO_SUBALTERNI;
  }
  throw new BadRequestException(`tipo documento non supportato: ${value}`);
}

export function documentTypePath(type: DocumentType) {
  if (type === DocumentType.VISURA) return "visura";
  if (type === DocumentType.ELENCO_SUBALTERNI) return "elenco_subalterni";
  return "planimetria";
}

export function erpDocumentType(type: DocumentType) {
  if (type === DocumentType.VISURA) return "visura_catastale";
  if (type === DocumentType.ELENCO_SUBALTERNI) return "elenco_subalterni";
  return "planimetria";
}
