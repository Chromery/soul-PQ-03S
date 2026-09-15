import { createHash } from "node:crypto";

// The requested rule; kept explicit so cadastral fields cannot be confused.
export const GROUP_MATCH_FIELD = "particella" as const;
type CandidateProperty = {
  id: string; valuationGroupId?: string | null; comune: string; provincia?: string | null;
  codiceComuneCatastale?: string | null; sezioneCatastale?: string | null;
  foglio?: string | null; particella?: string | null; subalterno?: string | null;
};

function normalized(value?: string | null) { return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("it-IT"); }
function cadastral(value?: string | null) {
  const text = normalized(value);
  // Incomplete references, lists and placeholders are not enough to suggest a group.
  if (!/^[0-9]+[A-Z]?$/.test(text)) return "";
  return text.replace(/^0+(?=\d)/, "");
}

export function buildGroupingSuggestions(studyId: string, properties: readonly CandidateProperty[]) {
  const groups = new Map<string, CandidateProperty[]>();
  for (const property of properties) {
    if (property.valuationGroupId) continue;
    const foglio = cadastral(property.foglio), match = cadastral(property[GROUP_MATCH_FIELD]);
    const municipality = normalized(property.comune).replace(/\s*\([A-Z]{2}\)$/, "");
    const jurisdiction = normalized(property.codiceComuneCatastale) || `${municipality}|${normalized(property.provincia)}`;
    if (!foglio || !match || !cadastral(property.subalterno) || (!municipality && !property.codiceComuneCatastale)) continue;
    const key = JSON.stringify([jurisdiction, normalized(property.sezioneCatastale), foglio, match]);
    const members = groups.get(key) ?? []; members.push(property); groups.set(key, members);
  }
  return [...groups.entries()].filter(([, members]) => members.length >= 2
    && new Set(members.map(member => cadastral(member.subalterno))).size === members.length).map(([key, members]) => {
    const propertyIds = [...new Set(members.map(property => property.id))].sort();
    return {
      id: createHash("sha256").update(JSON.stringify([studyId, GROUP_MATCH_FIELD, key, propertyIds])).digest("hex"),
      propertyIds, comune: members[0].comune, provincia: members[0].provincia ?? "",
      sezione: normalized(members[0].sezioneCatastale), foglio: cadastral(members[0].foglio),
      matchField: GROUP_MATCH_FIELD, matchValue: cadastral(members[0][GROUP_MATCH_FIELD]),
    };
  }).sort((a, b) => a.comune.localeCompare(b.comune, "it") || a.foglio.localeCompare(b.foglio, "it", { numeric: true }) || a.matchValue.localeCompare(b.matchValue, "it", { numeric: true }));
}
