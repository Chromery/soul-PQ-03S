import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

// Opt-in, read-only acceptance check against the explicitly imported staging batch.
test("real staging sample keeps plans, groups and saved areas usable for price suggestions", async ({ page }) => {
  test.skip(process.env.E2E_REAL_SAMPLE_BATCH !== "20261002", "Requires the additive October staging fixture import");
  test.setTimeout(120000);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  const result = await page.evaluate(async () => {
    const get = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw Error(`Unexpected ${response.status} from ${url}`);
      return response.json();
    };
    const studies = (await get("/api/studies")).filter((s: any) => s.id.startsWith("sample-20261002-feasibilitystudy-"));
    const properties = studies.flatMap((s: any) => s.properties.map((p: any) => ({ ...p, studyId: s.id })));
    const fileChecks = [];
    for (const study of studies) {
      // Two source studies intentionally exercise manual estimates without a plan.
      const property = study.properties.find((p: any) => p.documentUrls?.planimetria)
        ?? study.properties.find((p: any) => Object.values(p.documentUrls ?? {}).some(Boolean));
      if (!property) throw Error("Sample study without any attachment");
      const url = property.documentUrls.planimetria ?? Object.values(property.documentUrls).find(Boolean);
      const response = await fetch(url as string);
      const bytes = new Uint8Array(await response.arrayBuffer());
      fileChecks.push({ status: response.status, pdf: new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" });
    }
    const groups = [...new Set(properties.map((p: any) => p.valuationGroupId).filter(Boolean))] as string[];
    const groupChecks = [];
    for (const id of groups) {
      const draft = await get(`/api/property-valuation-groups/${id}/analysis-draft`);
      const response = await fetch(`/api/property-valuation-groups/${id}/documents/planimetria/download`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      groupChecks.push({ hasPlan: properties.some((p: any) => p.valuationGroupId === id && p.documentUrls?.planimetria),
        hasAreas: draft?.selections?.length > 0, status: response.status,
        pdf: new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" });
    }
    const property = properties.find((p: any) => p.id === "sample-20261002-property-1571806");
    if (!property) throw Error("Expected Milan fixture is missing");
    const draft = await get(`/api/properties/${property.id}/analysis-draft`);
    return { studies: studies.length, properties: properties.length, fileChecks, groupChecks,
      property, areaCount: draft?.selections?.length, draftProperty: draft?.propertyId,
      documentUrl: draft?.document?.url, originalRates: draft?.selections?.map((a: any) => a.rate) };
  });
  expect(result.studies).toBe(15); expect(result.properties).toBe(326);
  expect(result.fileChecks).toHaveLength(15);
  for (const file of result.fileChecks) expect(file).toEqual({ status: 200, pdf: true });
  expect(result.groupChecks).toHaveLength(3);
  expect(result.groupChecks.filter((group: any) => group.hasPlan)).toHaveLength(2);
  for (const group of result.groupChecks) {
    expect(group.hasAreas).toBe(true);
    expect(group.status).toBe(group.hasPlan ? 200 : 404);
    expect(group.pdf).toBe(group.hasPlan);
  }
  expect(result.areaCount).toBeGreaterThan(0);
  expect(result.draftProperty).toBe(result.property.id);
  expect(result.documentUrl).toContain(`/api/properties/${result.property.id}/`);
  await page.goto(`/studi/${result.property.studyId}/immobili/${result.property.id}/planimetria`);
  const suggestion = page.getByRole("button", { name: "Suggerisci prezzo per area 1", exact: true }).first();
  await expect(suggestion).toBeVisible({ timeout: 45000 });
  await suggestion.click();
  const dialog = page.getByRole("dialog", { name: "Scegli il prezzo dell’area" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Provincia", { exact: true })).toHaveValue("MI");
  // Changing a search filter must not change the operator's stored valuation.
  await dialog.getByLabel("Tipologia area", { exact: true }).selectOption("capannone");
  await expect(dialog.locator(".price-card").first()).toBeVisible();
  const stored = await page.evaluate(async id => (await (await fetch(`/api/properties/${id}/analysis-draft`)).json()).selections.map((a: any) => a.rate), result.property.id);
  expect(stored).toEqual(result.originalRates);
});
