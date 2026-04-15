/*
  # Corregir trigger update_stock_on_purchase

  ## Problema
  El trigger usaba SELECT INTO STRICT que lanza una excepción si no encuentra el producto
  o la factura, haciendo que toda la inserción de items fallara silenciosamente.
  Como resultado, las facturas se guardaban sin items.

  ## Cambios
  - Reemplaza SELECT INTO STRICT por SELECT INTO simple con verificación manual
  - Si el producto no existe, el trigger continúa sin crashear
  - Si la factura no existe, el trigger continúa sin crashear
  - Los items se insertan correctamente en todos los casos
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
  v_product_code text;
  v_product_name text;
  v_category text;
BEGIN
  SELECT stock, code, name, category
  INTO v_previous_stock, v_product_code, v_product_name, v_category
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
