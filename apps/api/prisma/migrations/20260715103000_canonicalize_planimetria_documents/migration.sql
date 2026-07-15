-- In PQ, elaborato planimetrico and planimetria identify the same editor document.
-- If historical data contains both aliases, preserve the canonical row ID and
-- copy the most recently updated document metadata onto it.
UPDATE "PropertyDocument" AS canonical
SET
  "erpDocumentId" = legacy."erpDocumentId",
  "fileName" = legacy."fileName",
  "storageKey" = legacy."storageKey",
  "mimeType" = legacy."mimeType",
  "sha256" = legacy."sha256",
  "sizeBytes" = legacy."sizeBytes",
  "updatedAt" = legacy."updatedAt"
FROM "PropertyDocument" AS legacy
WHERE canonical."propertyId" = legacy."propertyId"
  AND canonical."type" = 'PLANIMETRIA'
  AND legacy."type" = 'ELABORATO_PLANIMETRICO'
  AND legacy."updatedAt" >= canonical."updatedAt";

UPDATE "ScaleExtractionJob" AS job
SET "documentId" = canonical."id"
FROM "PropertyDocument" AS legacy
JOIN "PropertyDocument" AS canonical
  ON canonical."propertyId" = legacy."propertyId"
 AND canonical."type" = 'PLANIMETRIA'
WHERE job."documentId" = legacy."id"
  AND legacy."type" = 'ELABORATO_PLANIMETRICO';

DELETE FROM "PropertyDocument" AS legacy
USING "PropertyDocument" AS canonical
WHERE legacy."propertyId" = canonical."propertyId"
  AND legacy."type" = 'ELABORATO_PLANIMETRICO'
  AND canonical."type" = 'PLANIMETRIA';

UPDATE "PropertyDocument"
SET "type" = 'PLANIMETRIA'
WHERE "type" = 'ELABORATO_PLANIMETRICO';
