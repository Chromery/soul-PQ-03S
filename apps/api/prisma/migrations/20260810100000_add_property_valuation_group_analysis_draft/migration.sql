CREATE TABLE "PropertyValuationGroupAnalysisDraft" (
    "id" TEXT NOT NULL,
    "valuationGroupId" TEXT NOT NULL,
    "documentSource" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "sheetSize" TEXT NOT NULL,
    "scaleDenominator" INTEGER NOT NULL,
    "scaleSource" TEXT NOT NULL DEFAULT 'DEFAULT',
    "aiScaleDenominator" INTEGER,
    "aiScaleLabel" TEXT,
    "aiSheetSize" TEXT,
    "aiScaleConfidence" DECIMAL(5,4),
    "aiScaleDetectedAt" TIMESTAMP(3),
    "totalArea" DECIMAL(16,2),
    "totalEstimatedValue" DECIMAL(16,2),
    "savedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyValuationGroupAnalysisDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyValuationGroupAnalysisDraft_valuationGroupId_key"
ON "PropertyValuationGroupAnalysisDraft"("valuationGroupId");

ALTER TABLE "PropertyValuationGroupAnalysisDraft"
ADD CONSTRAINT "PropertyValuationGroupAnalysisDraft_valuationGroupId_fkey"
FOREIGN KEY ("valuationGroupId") REFERENCES "PropertyValuationGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
