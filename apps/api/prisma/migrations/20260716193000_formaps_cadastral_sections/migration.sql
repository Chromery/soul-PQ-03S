-- Preserve the cadastral section and the exact forMaps municipality identifier.
ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "sezioneCatastale" TEXT,
  ADD COLUMN IF NOT EXISTS "codiceComuneCatastale" TEXT,
  ADD COLUMN IF NOT EXISTS "formapsMunicipalityId" TEXT;

ALTER TABLE "VisuraExtractionJob"
  ADD COLUMN IF NOT EXISTS "extractedSezioneCatastale" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedCodiceComuneCatastale" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedFormapsMunicipalityId" TEXT,
  ADD COLUMN IF NOT EXISTS "extractionMethod" TEXT;

CREATE INDEX IF NOT EXISTS "Property_formapsMunicipalityId_idx"
  ON "Property"("formapsMunicipalityId");
