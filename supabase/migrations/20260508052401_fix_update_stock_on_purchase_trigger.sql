/*
  # Fix update_stock_on_purchase trigger

  1. Problem
    - The trigger function references columns (product_code, category, previous_stock, new_stock, reference)
      that do not exist in the inventory_movements table.
    - This causes all inserts into purchase_invoice_items to fail silently from the app.

  2. Fix
    - Rewrite the trigger function to use the actual columns:
      product_id, product_name, product_category, type, quantity, reason, supplier, user_name, notes
    - Stock update logic remains the same.
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
    notes
  ) VALUES (
    NEW.product_id,
    v_product_name,
    v_category,
    'purchase',
    NEW.quantity,
    'Compra ' || COALESCE(v_invoice_number, ''),
    v_supplier,
    'Factura ' || COALESCE(v_invoice_number, '')
  );

  RETURN NEW;
END;
$$;
