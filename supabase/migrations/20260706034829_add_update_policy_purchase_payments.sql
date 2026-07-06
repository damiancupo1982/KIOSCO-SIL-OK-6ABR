/*
# Add UPDATE policy to purchase_payments

1. Security Changes
  - Add UPDATE policy on `purchase_payments` table for anon and authenticated roles
  - This allows editing the payment_method on existing payments

2. Notes
  - Single-tenant app (no auth), so policy uses TO anon, authenticated
*/

DROP POLICY IF EXISTS "public_update_purchase_payments" ON purchase_payments;
CREATE POLICY "public_update_purchase_payments" ON purchase_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
