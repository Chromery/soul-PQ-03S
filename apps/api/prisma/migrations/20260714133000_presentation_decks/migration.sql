CREATE TABLE "PresentationDeck" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "propertyIds" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresentationDeck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PresentationDeck_studyId_createdAt_idx" ON "PresentationDeck"("studyId", "createdAt");

ALTER TABLE "PresentationDeck"
ADD CONSTRAINT "PresentationDeck_studyId_fkey"
FOREIGN KEY ("studyId") REFERENCES "FeasibilityStudy"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
