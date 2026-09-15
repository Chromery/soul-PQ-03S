CREATE TABLE "PropertyValuationGroupRevision" (
  "id" TEXT NOT NULL,
  "studyId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyValuationGroupRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PropertyValuationGroupRevision_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "FeasibilityStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PropertyValuationGroupRevision_studyId_groupId_idx" ON "PropertyValuationGroupRevision"("studyId", "groupId");
