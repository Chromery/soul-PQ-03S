import type { PresentationPropertySnapshot } from "./presentations.types.js";

export function normalizePresentationCategory(value: string) {
  return value.trim().toUpperCase().replace(/^([A-F])\s*\/?\s*(\d+)$/, "$1/$2");
}

export function presentationGroupKeys(sources: readonly { id: string; valuationGroupId?: string | null }[], overrides: Record<string, string>) {
  return new Set(sources.flatMap(source => {
    const group = overrides[`${source.id}:presentationGroup`] ?? (source.valuationGroupId ? `valuation:${source.valuationGroupId}` : "");
    return group ? [`group:${group}`] : [];
  }));
}

export function groupPresentationRows(
  properties: PresentationPropertySnapshot[],
  sources: readonly { id: string; valuationGroupId?: string | null }[],
  overrides: Record<string, string>,
): PresentationPropertySnapshot[] {
  const sourceById = new Map(sources.map(property => [property.id, property]));
  const groups = new Map<string, PresentationPropertySnapshot[]>();
  for (const property of properties) {
    const source = sourceById.get(property.id);
    const group = overrides[`${property.id}:presentationGroup`] ?? (source?.valuationGroupId ? `valuation:${source.valuationGroupId}` : "");
    const key = group ? `group:${group}` : `property:${property.id}`;
    const members = groups.get(key) ?? [];
    members.push(property); groups.set(key, members);
  }
  return [...groups.entries()].map(([key, members]) => {
    const customize = (row: PresentationPropertySnapshot) => {
      const result = { ...row };
      // A group has its own preference, including when only one member is exported.
      // Member preferences remain saved and become effective again on dissolution.
      const scope = key.startsWith("group:") ? key : row.id;
      result.reductionBasis = overrides[`${scope}:reductionBasis`] === "imu" ? "imu" : "rent";
      if (key.startsWith("group:")) for (const field of ["societa", "comune", "indirizzo", "foglioParticellaSub", "categoria"] as const) {
        const value = overrides[`${key}:${field}`];
        if (value !== undefined && value.trim()) result[field] = value.trim();
      }
      if (key.startsWith("group:") && overrides[`${key}:categoria`]) result.categoria = normalizePresentationCategory(result.categoria);
      return result;
    };
    if (members.length === 1) return customize(members[0]);
    const join = (field: "societa" | "comune" | "indirizzo" | "categoria") =>
      [...new Set(members.map(member => field === "categoria" ? normalizePresentationCategory(member[field]) : member[field].trim()).filter(Boolean))].join(" / ");
    const sum = (field: "renditaAttuale" | "renditaAttribuibile" | "imuAttuale" | "imuOttenibile") =>
      members.some(member => member[field] == null) ? null
        : members.reduce((total, member) => total + Math.round(member[field]! * 100), 0) / 100;
    return customize({
      ...members[0], memberIds: members.map(member => member.id),
      outcome: members.every(member => member.outcome === members[0].outcome) ? members[0].outcome : "Misto",
      societa: join("societa"), comune: join("comune"), indirizzo: join("indirizzo"), categoria: join("categoria"),
      foglioParticellaSub: combineCadastralReferences(members.map(member => member.foglioParticellaSub)),
      renditaAttuale: sum("renditaAttuale")!, renditaAttribuibile: sum("renditaAttribuibile")!,
      imuAttuale: sum("imuAttuale"), imuOttenibile: sum("imuOttenibile"),
    });
  });
}

export function combineCadastralReferences(values: string[]) {
  const distinct = [...new Set(values)];
  const matches = distinct.map(value => /^(.*? - Sub\. )(.+)$/.exec(value));
  if (matches.every(match => match && match[1] === matches[0]?.[1]))
    return matches[0]![1] + matches.map(match => match![2]).join(", ");
  return distinct.join(" / ");
}
