UPDATE "PropertyDocument"
SET
  "fileName" = 'planimetria-au-01.pdf',
  "storageKey" = 'erp/S-2026-0187/AU-01/planimetria/1c1122b6470b-planimetria-au-01.pdf',
  "sha256" = '1c1122b6470b135f7394eb6b115e45b5be73b913d61c7b01c1b8a167223f1a07',
  "sizeBytes" = 12947,
  "mimeType" = 'application/pdf',
  "updatedAt" = now()
WHERE "propertyId" = 'AU-01' AND "type" = 'PLANIMETRIA';

UPDATE "PropertyDocument"
SET
  "fileName" = 'planimetria-au-02.pdf',
  "storageKey" = 'erp/S-2026-0187/AU-02/planimetria/89e7849dd002-planimetria-au-02.pdf',
  "sha256" = '89e7849dd0027c1f896c7626ae6e3c890eded9f7aacd6289aa2e69d4af926100',
  "sizeBytes" = 17840,
  "mimeType" = 'application/pdf',
  "updatedAt" = now()
WHERE "propertyId" = 'AU-02' AND "type" = 'PLANIMETRIA';

UPDATE "PropertyDocument"
SET
  "fileName" = 'planimetria-au-03.pdf',
  "storageKey" = 'erp/S-2026-0187/AU-03/planimetria/a29f5f5a87c0-planimetria-au-03.pdf',
  "sha256" = 'a29f5f5a87c0dca79f018f8f91749124584775dcc5015af9b3093d68ceb058bf',
  "sizeBytes" = 35868,
  "mimeType" = 'application/pdf',
  "updatedAt" = now()
WHERE "propertyId" = 'AU-03' AND "type" = 'PLANIMETRIA';
