type LocatedProperty = {
  provincia?: string | null;
  comune?: string | null;
  formapsProvincia?: string | null;
  formapsComune?: string | null;
};

// A combined editor inherits some fields from its first property. Never use those
// inherited fields to assume that every page belongs to the first property's town.
export function priceRuleLocation(properties: LocatedProperty[]) {
  const locations = properties.map((p) => ({
    province: (p.formapsProvincia || p.provincia || "").trim(),
    municipality: (p.formapsComune || p.comune || "").trim(),
  }));
  const shared = (key: "province" | "municipality") => {
    const first = locations[0]?.[key];
    return first &&
      locations.every(
        (l) => l[key].toLocaleLowerCase("it") === first.toLocaleLowerCase("it"),
      )
      ? first
      : undefined;
  };
  const province = shared("province");
  // Identically named municipalities in different provinces are not one territory.
  const municipality =
    properties.length <= 1 || province ? shared("municipality") : undefined;
  return {
    province,
    municipality,
    ambiguous: properties.length > 1 && (!province || !municipality),
  };
}
