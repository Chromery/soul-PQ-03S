CREATE TABLE "PropertyGroupingDismissal" (
    "studyId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyGroupingDismissal_pkey" PRIMARY KEY ("studyId", "signature"),
    CONSTRAINT "PropertyGroupingDismissal_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "FeasibilityStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
