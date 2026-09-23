-- Preserve the previous API representation of legacy dates (midnight UTC).
-- The original time was discarded by DATE and cannot be reconstructed.
-- Explicit UTC makes this migration independent of the session/server timezone.
SET lock_timeout = '10s';
ALTER TABLE "FeasibilityStudy"
  ALTER COLUMN "concludedAt" TYPE TIMESTAMPTZ(3)
  USING ("concludedAt"::timestamp AT TIME ZONE 'UTC');
RESET lock_timeout;
