CREATE TABLE "StudyGroupAnalysisDraft" (
    "id" TEXT NOT NULL,
    "studyGroupId" TEXT NOT NULL,
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

    CONSTRAINT "StudyGroupAnalysisDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudyGroupAnalysisDraft_studyGroupId_key"
ON "StudyGroupAnalysisDraft"("studyGroupId");

ALTER TABLE "StudyGroupAnalysisDraft"
ADD CONSTRAINT "StudyGroupAnalysisDraft_studyGroupId_fkey"
FOREIGN KEY ("studyGroupId") REFERENCES "StudyGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
