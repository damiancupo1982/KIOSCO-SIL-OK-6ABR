/*
# Add UPDATE policy to cash_transactions

1. Security Changes
  - Add UPDATE policy on `cash_transactions` table for anon and authenticated roles
  - This allows editing payment_method on existing cash transactions when correcting purchase payments

2. Notes
  - Single-tenant app (no auth), so policy uses TO anon, authenticated
*/

DROP POLICY IF EXISTS "Anyone can update cash_transactions" ON cash_transactions;
CREATE POLICY "Anyone can update cash_transactions" ON cash_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
