-- Expand evidence_tier allowed values and normalise descriptive variants in existing rows.
-- Previous constraint allowed: VERIFIED 3-0, VERIFIED 2-1, SOURCED, UNVERIFIED, NOT CONFIRMED
-- New canonical set: VERIFIED 3-0, VERIFIED 2-1, SOURCED UNVERIFIED, NOT CONFIRMED,
--                    REFUTED, UNVERIFIED-OBSERVED, UNVERIFIED/MIXED

-- 1. Drop the existing check constraint so the UPDATE statements below can't violate it.
--    Postgres auto-names inline constraints <table>_<column>_check.
ALTER TABLE hooks DROP CONSTRAINT IF EXISTS hooks_evidence_tier_check;

-- 2. Normalise all descriptive variants to canonical tier strings.
--    Order matters: more-specific prefixes (VERIFIED 3-0) before less-specific (VERIFIED).
UPDATE hooks SET evidence_tier = 'VERIFIED 3-0'       WHERE evidence_tier LIKE 'VERIFIED 3-0%';
UPDATE hooks SET evidence_tier = 'VERIFIED 2-1'       WHERE evidence_tier LIKE 'VERIFIED 2-1%';
UPDATE hooks SET evidence_tier = 'SOURCED UNVERIFIED'  WHERE evidence_tier LIKE 'SOURCED, UNVERIFIED%'
                                                          OR evidence_tier LIKE 'SOURCED UNVERIFIED%';
UPDATE hooks SET evidence_tier = 'NOT CONFIRMED'       WHERE evidence_tier LIKE 'NOT CONFIRMED%';
UPDATE hooks SET evidence_tier = 'REFUTED'             WHERE evidence_tier LIKE 'REFUTED%';
UPDATE hooks SET evidence_tier = 'UNVERIFIED-OBSERVED' WHERE evidence_tier LIKE 'UNVERIFIED-OBSERVED%';
UPDATE hooks SET evidence_tier = 'UNVERIFIED/MIXED'    WHERE evidence_tier LIKE 'UNVERIFIED / MIXED%'
                                                          OR evidence_tier LIKE 'UNVERIFIED/MIXED%';

-- 3. Re-add the constraint.  Guard against re-runs on production where it may already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hooks_evidence_tier_check'
      AND conrelid = 'hooks'::regclass
  ) THEN
    ALTER TABLE hooks ADD CONSTRAINT hooks_evidence_tier_check CHECK (
      evidence_tier IN (
        'VERIFIED 3-0',
        'VERIFIED 2-1',
        'SOURCED UNVERIFIED',
        'NOT CONFIRMED',
        'REFUTED',
        'UNVERIFIED-OBSERVED',
        'UNVERIFIED/MIXED'
      )
    );
  END IF;
END;
$$;
