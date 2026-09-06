-- One-time handover: retain existing studies as test data. Future studies are operational.
ALTER TABLE "FeasibilityStudy" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
UPDATE "FeasibilityStudy" SET "isTest" = true;
