-- Trigger to update product stock and record inventory movement
-- when a purchase invoice item is inserted.

CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_stock numeric;
  v_new_stock numeric;
  v_invoice_number text;
  v_supplier text;
  v_product_code text;
  v_product_name text;
  v_category text;
BEGIN
  -- Get current stock before update (raise exception if product not found)
  SELECT stock, code, name, category
  INTO STRICT v_previous_stock, v_product_code, v_product_name, v_category
  FROM products
  WHERE id = NEW.product_id;

  v_new_stock := COALESCE(v_previous_stock, 0) + NEW.quantity;

  -- Update product stock
  UPDATE products
  SET stock = v_new_stock
  WHERE id = NEW.product_id;

  -- Get invoice details for the movement record (raise exception if invoice not found)
  SELECT invoice_number, supplier
  INTO STRICT v_invoice_number, v_supplier
  FROM purchase_invoices
  WHERE id = NEW.invoice_id;

  -- Record the inventory movement (stock and movement tracked at DB level)
  INSERT INTO inventory_movements (
    product_id,
    product_code,
    product_name,
    category,
    type,
    quantity,
    previous_stock,
    new_stock,
    supplier,
    reference,
    notes
  ) VALUES (
    NEW.product_id,
    v_product_code,
    v_product_name,
    v_category,
    'purchase',
    NEW.quantity,
    COALESCE(v_previous_stock, 0),
    v_new_stock,
    v_supplier,
    v_invoice_number,
    'Compra ' || COALESCE(v_invoice_number, '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stock_on_purchase ON purchase_invoice_items;
CREATE TRIGGER trg_update_stock_on_purchase
AFTER INSERT ON purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION update_stock_on_purchase();
