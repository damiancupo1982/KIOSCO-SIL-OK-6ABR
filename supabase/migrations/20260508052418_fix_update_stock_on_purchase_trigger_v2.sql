/*
  # Fix update_stock_on_purchase trigger (v2)

  1. Problem
    - The user_name column in inventory_movements is NOT NULL, trigger must supply a value.

  2. Fix
    - Add user_name with default value 'Sistema (compra)' in the trigger insert.
*/

CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_stock numeric;
  v_new_stock numeric;
  v_invoice_number text;
  v_supplier text;
  v_product_name text;
  v_category text;
BEGIN
  SELECT stock, name, category
  INTO v_previous_stock, v_product_name, v_category
  FROM products
  WHERE id = NEW.product_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_new_stock := COALESCE(v_previous_stock, 0) + NEW.quantity;

  UPDATE products
  SET stock = v_new_stock
  WHERE id = NEW.product_id;

  SELECT invoice_number, supplier
  INTO v_invoice_number, v_supplier
  FROM purchase_invoices
  WHERE id = NEW.invoice_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO inventory_movements (
    product_id,
    product_name,
    product_category,
    type,
    quantity,
    reason,
    supplier,
    user_name,
    notes
  ) VALUES (
    NEW.product_id,
    v_product_name,
    v_category,
    'purchase',
    NEW.quantity,
    'Compra ' || COALESCE(v_invoice_number, ''),
    v_supplier,
    'Sistema (compra)',
    'Factura ' || COALESCE(v_invoice_number, '')
  );

  RETURN NEW;
END;
$$;
