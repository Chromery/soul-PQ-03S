-- Preserve the two calculations exactly as before; subsequent edits are independent.
ALTER TABLE "Property" ADD COLUMN "currentImuRateOverride" DECIMAL(7,4),
  ADD COLUMN "currentImuMultiplierOverride" DECIMAL(10,4);
UPDATE "Property" SET "currentImuRateOverride" = "imuRateOverride",
  "currentImuMultiplierOverride" = "imuMultiplierOverride";
