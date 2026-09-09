ALTER TABLE "PresentationDeck" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "PresentationDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studyId" TEXT UNIQUE REFERENCES "FeasibilityStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "studyGroupId" TEXT UNIQUE REFERENCES "StudyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "overrides" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PresentationDraft_one_owner" CHECK (("studyId" IS NOT NULL) <> ("studyGroupId" IS NOT NULL))
);
