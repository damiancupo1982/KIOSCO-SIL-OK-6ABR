/*
  # Add tiene_tenis field to socios

  1. Modified Tables
    - `socios`
      - Added `tiene_tenis` (boolean, default false) - indicates if the member has a tennis card

  2. Notes
    - This field is per-person, not per-lot
    - Used to calculate 20% discount on carnet pricing
    - Compatible with existing data (defaults to false)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'socios' AND column_name = 'tiene_tenis'
  ) THEN
    ALTER TABLE socios ADD COLUMN tiene_tenis boolean NOT NULL DEFAULT false;
  END IF;
END $$;
