ALTER TABLE "StudyGroup"
ADD COLUMN "name" TEXT;

ALTER TABLE "Property"
ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PresentationDeck"
ALTER COLUMN "studyId" DROP NOT NULL,
ADD COLUMN "studyGroupId" TEXT;

CREATE INDEX "PresentationDeck_studyGroupId_createdAt_idx"
ON "PresentationDeck"("studyGroupId", "createdAt");

ALTER TABLE "PresentationDeck"
ADD CONSTRAINT "PresentationDeck_studyGroupId_fkey"
FOREIGN KEY ("studyGroupId") REFERENCES "StudyGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PresentationDeck"
ADD CONSTRAINT "PresentationDeck_exactly_one_owner_check"
CHECK (("studyId" IS NOT NULL) <> ("studyGroupId" IS NOT NULL));
