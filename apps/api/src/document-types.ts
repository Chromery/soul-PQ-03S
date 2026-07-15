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
  throw new BadRequestException(`tipo documento non supportato: ${value}`);
}

export function documentTypePath(type: DocumentType) {
  return type === DocumentType.VISURA ? "visura" : "planimetria";
}

export function erpDocumentType(type: DocumentType) {
  return type === DocumentType.VISURA ? "visura_catastale" : "planimetria";
}
