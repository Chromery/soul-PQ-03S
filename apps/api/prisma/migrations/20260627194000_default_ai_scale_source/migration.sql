ALTER TABLE "PlanAnalysisDraft"
  ALTER COLUMN "scaleSource" SET DEFAULT 'DEFAULT';

UPDATE "PlanAnalysisDraft"
SET "scaleSource" = 'DEFAULT'
WHERE "scaleSource" = 'USER'
  AND NOT ("payload" ? 'scaleSource');

UPDATE "Property" AS property
SET "scaleSource" = 'DEFAULT'
FROM "PlanAnalysisDraft" AS draft
WHERE property."id" = draft."propertyId"
  AND property."scaleSource" = 'USER'
  AND NOT (draft."payload" ? 'scaleSource');
