CREATE TABLE "PropertyValuationGroup" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyValuationGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Property" ADD COLUMN "valuationGroupId" TEXT;

CREATE INDEX "PropertyValuationGroup_studyId_idx" ON "PropertyValuationGroup"("studyId");
CREATE INDEX "Property_valuationGroupId_idx" ON "Property"("valuationGroupId");

ALTER TABLE "PropertyValuationGroup"
ADD CONSTRAINT "PropertyValuationGroup_studyId_fkey"
FOREIGN KEY ("studyId") REFERENCES "FeasibilityStudy"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Property"
ADD CONSTRAINT "Property_valuationGroupId_fkey"
FOREIGN KEY ("valuationGroupId") REFERENCES "PropertyValuationGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
