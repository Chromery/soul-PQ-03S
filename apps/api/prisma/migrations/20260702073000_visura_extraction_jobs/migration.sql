-- Async visura extraction jobs for cadastral data OCR/VLM analysis.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VisuraExtractionStatus') THEN
    CREATE TYPE "VisuraExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "VisuraExtractionJob" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "documentId" TEXT,
  "status" "VisuraExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "model" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceSha256" TEXT,
  "extractedProvincia" TEXT,
  "extractedComune" TEXT,
  "extractedFoglio" TEXT,
  "extractedParticella" TEXT,
  "confidence" DECIMAL(5,4),
  "evidence" TEXT,
  "warnings" JSONB,
  "rawResponse" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisuraExtractionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VisuraExtractionJob_propertyId_createdAt_idx" ON "VisuraExtractionJob"("propertyId", "createdAt");
CREATE INDEX IF NOT EXISTS "VisuraExtractionJob_documentId_idx" ON "VisuraExtractionJob"("documentId");
CREATE INDEX IF NOT EXISTS "VisuraExtractionJob_status_createdAt_idx" ON "VisuraExtractionJob"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VisuraExtractionJob_propertyId_fkey'
  ) THEN
    ALTER TABLE "VisuraExtractionJob"
      ADD CONSTRAINT "VisuraExtractionJob_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VisuraExtractionJob_documentId_fkey'
  ) THEN
    ALTER TABLE "VisuraExtractionJob"
      ADD CONSTRAINT "VisuraExtractionJob_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "PropertyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
