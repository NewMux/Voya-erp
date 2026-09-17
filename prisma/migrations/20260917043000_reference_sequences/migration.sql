-- Human-facing reference numbers.
--
-- These come from Postgres sequences rather than `SELECT count(*) + 1`, which
-- races: two staff creating a booking in the same moment would otherwise be
-- handed the same reference and one insert would fail on the unique index.
--
-- nextval() is non-transactional by design. A rolled-back booking therefore
-- burns a number, leaving a gap in the series. That is the correct trade-off
-- here: gaps are harmless, duplicates are not.

-- Membership numbers: VY-0000001 (PRD section 5, e.g. VY-0001042).
CREATE SEQUENCE IF NOT EXISTS membership_number_seq AS BIGINT START WITH 1 INCREMENT BY 1;

-- Invoice numbers restart each calendar year: VOY-2026-000001.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq AS BIGINT START WITH 1 INCREMENT BY 1;

-- Booking references restart each calendar year: VB-2026-000001.
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq AS BIGINT START WITH 1 INCREMENT BY 1;

-- Tracks the year the yearly sequences were last reset, so the first call in a
-- new year rolls them back to 1 exactly once.
CREATE TABLE IF NOT EXISTS reference_sequence_years (
  sequence_name TEXT PRIMARY KEY,
  year          INTEGER NOT NULL
);

-- Returns the next value for a year-scoped sequence, resetting it when the
-- year rolls over.
--
-- The advisory lock serialises the reset so that two concurrent callers on
-- 1 January cannot both observe "year changed" and both restart the sequence.
-- It is released automatically at the end of the transaction.
CREATE OR REPLACE FUNCTION next_yearly_reference(p_sequence TEXT, p_year INTEGER)
RETURNS BIGINT AS $$
DECLARE
  v_last_year INTEGER;
  v_value     BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('voya_reference_' || p_sequence));

  SELECT year INTO v_last_year
  FROM reference_sequence_years
  WHERE sequence_name = p_sequence;

  IF v_last_year IS NULL THEN
    INSERT INTO reference_sequence_years (sequence_name, year)
    VALUES (p_sequence, p_year);
  ELSIF v_last_year <> p_year THEN
    EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', p_sequence);
    UPDATE reference_sequence_years SET year = p_year WHERE sequence_name = p_sequence;
  END IF;

  EXECUTE format('SELECT nextval(%L)', p_sequence) INTO v_value;
  RETURN v_value;
END;
$$ LANGUAGE plpgsql;
