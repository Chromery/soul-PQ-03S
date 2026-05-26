-- Add ERP-linked cadastral and financial data used by the study detail workflow.
ALTER TABLE "Property"
ADD COLUMN "ubicazione" TEXT,
ADD COLUMN "foglio" TEXT,
ADD COLUMN "particella" TEXT,
ADD COLUMN "subalterno" TEXT,
ADD COLUMN "titolarita" TEXT,
ADD COLUMN "currentImu" DECIMAL(14,2),
ADD COLUMN "estimatedImu" DECIMAL(14,2),
ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
