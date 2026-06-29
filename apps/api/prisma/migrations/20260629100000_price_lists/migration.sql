CREATE TABLE IF NOT EXISTS "PriceList" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sourcePath" TEXT,
  "territoryName" TEXT NOT NULL,
  "territoryScope" TEXT NOT NULL,
  "comune" TEXT,
  "provincia" TEXT,
  "region" TEXT,
  "year" INTEGER,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PropertyPriceList" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "distanceKm" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PropertyPriceList_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PriceList_storageKey_key" ON "PriceList"("storageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PriceList_sourcePath_key" ON "PriceList"("sourcePath");
CREATE INDEX IF NOT EXISTS "PriceList_territoryScope_comune_idx" ON "PriceList"("territoryScope", "comune");
CREATE INDEX IF NOT EXISTS "PriceList_region_idx" ON "PriceList"("region");
CREATE INDEX IF NOT EXISTS "PriceList_provincia_idx" ON "PriceList"("provincia");

CREATE UNIQUE INDEX IF NOT EXISTS "PropertyPriceList_propertyId_priceListId_key" ON "PropertyPriceList"("propertyId", "priceListId");
CREATE INDEX IF NOT EXISTS "PropertyPriceList_propertyId_rank_idx" ON "PropertyPriceList"("propertyId", "rank");
CREATE INDEX IF NOT EXISTS "PropertyPriceList_priceListId_idx" ON "PropertyPriceList"("priceListId");

ALTER TABLE "PropertyPriceList"
  ADD CONSTRAINT "PropertyPriceList_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyPriceList"
  ADD CONSTRAINT "PropertyPriceList_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
