-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PLANIMETRIA', 'VISURA');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('BOZZA', 'COMPLETATO');

-- CreateTable
CREATE TABLE "FeasibilityStudy" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "vat" TEXT NOT NULL,
    "comune" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATE NOT NULL,
    "concludedAt" DATE,
    "deadline" DATE NOT NULL,
    "nextAppointment" TIMESTAMP(3),
    "diffRendita" DECIMAL(12,2) NOT NULL,
    "diffImu" DECIMAL(14,2) NOT NULL,
    "originalRendita" DECIMAL(14,2) NOT NULL,
    "totalRendita" DECIMAL(14,2) NOT NULL,
    "catDRendita" DECIMAL(14,2) NOT NULL,
    "commercialOwner" TEXT NOT NULL,
    "technicalOwner" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "erpUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeasibilityStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyVersion" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "technicalOwner" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "comune" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "currentRendita" DECIMAL(14,2) NOT NULL,
    "estimatedRendita" DECIMAL(14,2) NOT NULL,
    "diffPercent" DECIMAL(10,2) NOT NULL,
    "imuDiff" DECIMAL(14,2) NOT NULL,
    "outcome" TEXT NOT NULL,
    "hasStudy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDocument" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAnalysisDraft" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "studyVersionId" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'BOZZA',
    "documentSource" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "sheetSize" TEXT NOT NULL,
    "scaleDenominator" INTEGER NOT NULL,
    "totalArea" DECIMAL(16,2),
    "totalEstimatedValue" DECIMAL(16,2),
    "savedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanAnalysisDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyVersion_studyId_versionNumber_key" ON "StudyVersion"("studyId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyDocument_propertyId_type_key" ON "PropertyDocument"("propertyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PlanAnalysisDraft_propertyId_key" ON "PlanAnalysisDraft"("propertyId");

-- AddForeignKey
ALTER TABLE "StudyVersion" ADD CONSTRAINT "StudyVersion_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "FeasibilityStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "FeasibilityStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDocument" ADD CONSTRAINT "PropertyDocument_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAnalysisDraft" ADD CONSTRAINT "PlanAnalysisDraft_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAnalysisDraft" ADD CONSTRAINT "PlanAnalysisDraft_studyVersionId_fkey" FOREIGN KEY ("studyVersionId") REFERENCES "StudyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
