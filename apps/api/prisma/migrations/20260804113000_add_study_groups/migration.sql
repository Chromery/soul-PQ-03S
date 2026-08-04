CREATE TABLE "StudyGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FeasibilityStudy" ADD COLUMN "studyGroupId" TEXT;

CREATE INDEX "FeasibilityStudy_studyGroupId_idx" ON "FeasibilityStudy"("studyGroupId");

ALTER TABLE "FeasibilityStudy"
ADD CONSTRAINT "FeasibilityStudy_studyGroupId_fkey"
FOREIGN KEY ("studyGroupId") REFERENCES "StudyGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
