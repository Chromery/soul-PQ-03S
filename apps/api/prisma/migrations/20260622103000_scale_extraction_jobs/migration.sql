-- Scale extraction jobs for planimetria OCR/VLM analysis.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScaleExtractionStatus') THEN
    CREATE TYPE "ScaleExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ScaleExtractionJob" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "documentId" TEXT,
  "status" "ScaleExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "model" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceSha256" TEXT,
  "detectedScaleDenominator" INTEGER,
  "detectedScaleLabel" TEXT,
  "detectedSheetSize" TEXT,
  "confidence" DECIMAL(5,4),
  "evidence" TEXT,
  "warnings" JSONB,
  "rawResponse" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScaleExtractionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScaleExtractionJob_propertyId_createdAt_idx" ON "ScaleExtractionJob"("propertyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ScaleExtractionJob_documentId_idx" ON "ScaleExtractionJob"("documentId");
CREATE INDEX IF NOT EXISTS "ScaleExtractionJob_status_createdAt_idx" ON "ScaleExtractionJob"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScaleExtractionJob_propertyId_fkey'
  ) THEN
    ALTER TABLE "ScaleExtractionJob"
      ADD CONSTRAINT "ScaleExtractionJob_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScaleExtractionJob_documentId_fkey'
  ) THEN
    ALTER TABLE "ScaleExtractionJob"
      ADD CONSTRAINT "ScaleExtractionJob_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "PropertyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
