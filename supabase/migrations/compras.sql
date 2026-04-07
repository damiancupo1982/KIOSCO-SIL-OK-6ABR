CREATE TABLE IF NOT EXISTS purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  supplier text NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','partial','paid')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_select" ON purchase_invoices FOR SELECT USING (true);
CREATE POLICY "public_insert" ON purchase_invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update" ON purchase_invoices FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric NOT NULL,
  purchase_price numeric NOT NULL,
  sale_price numeric NOT NULL,
  subtotal numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_select" ON purchase_invoice_items FOR SELECT USING (true);
CREATE POLICY "public_insert" ON purchase_invoice_items FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pii_invoice_id ON purchase_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pii_product_id ON purchase_invoice_items(product_id);

CREATE TABLE IF NOT EXISTS purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_select" ON purchase_payments FOR SELECT USING (true);
CREATE POLICY "public_insert" ON purchase_payments FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pp_invoice_id ON purchase_payments(invoice_id);

CREATE OR REPLACE FUNCTION generate_purchase_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  last_number integer;
  new_number text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS integer)), 0)
  INTO last_number
  FROM purchase_invoices
  WHERE invoice_number ~ '^FC-[0-9]{6}$';
  new_number := 'FC-' || LPAD((last_number + 1)::text, 6, '0');
  RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION update_purchase_invoice_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_paid numeric;
  inv_total numeric;
  new_status text;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM purchase_payments
  WHERE invoice_id = NEW.invoice_id;

  SELECT total INTO inv_total
  FROM purchase_invoices
  WHERE id = NEW.invoice_id;

  IF total_paid >= inv_total THEN
    new_status := 'paid';
  ELSIF total_paid > 0 THEN
    new_status := 'partial';
  ELSE
    new_status := 'pending';
  END IF;

  UPDATE purchase_invoices
  SET paid_amount = total_paid, status = new_status
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_invoice_status_on_payment ON purchase_payments;
CREATE TRIGGER update_invoice_status_on_payment
AFTER INSERT ON purchase_payments
FOR EACH ROW EXECUTE FUNCTION update_purchase_invoice_status();

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  product_code text,
  product_name text,
  category text,
  type text CHECK (type IN ('sale','purchase')),
  quantity numeric,
  previous_stock numeric,
  new_stock numeric,
  supplier text,
  reference text,
  user_name text,
  shift_id uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "public_select_im" ON inventory_movements FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_insert_im" ON inventory_movements FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "public_delete_im" ON inventory_movements FOR DELETE USING (true);
