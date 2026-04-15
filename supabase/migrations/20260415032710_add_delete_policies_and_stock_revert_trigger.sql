/*
  # Agregar políticas DELETE y trigger de reversión de stock

  ## Problema
  Al eliminar una factura de compra:
  1. Faltaba política DELETE en purchase_invoices → la eliminación fallaba silenciosamente por RLS
  2. Faltaba política DELETE en purchase_invoice_items
  3. El trigger update_stock_on_purchase solo suma stock al insertar, pero no lo revierte al borrar

  ## Cambios

  ### Seguridad (RLS)
  - Agrega política DELETE para purchase_invoices (anon/authenticated)
  - Agrega política DELETE para purchase_invoice_items (anon/authenticated)

  ### Nueva función y trigger
  - revert_stock_on_purchase_delete(): resta el stock del producto cuando se elimina un item
  - trg_revert_stock_on_purchase_delete: trigger BEFORE DELETE en purchase_invoice_items

  ## Notas
  - El cascade ON DELETE CASCADE en purchase_invoice_items ya propaga la eliminación de items
    cuando se elimina la factura padre, por lo que el trigger de reversión cubre ambos casos.
  - El código frontend que también intenta revertir stock manualmente seguirá funcionando
    sin conflicto, ya que el trigger actúa antes del delete y el frontend lee stock después.
*/

-- Política DELETE para purchase_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_invoices'
    AND policyname = 'Allow anon delete purchase_invoices'
  ) THEN
    CREATE POLICY "Allow anon delete purchase_invoices"
      ON purchase_invoices
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Política DELETE para purchase_invoice_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_invoice_items'
    AND policyname = 'Allow anon delete purchase_invoice_items'
  ) THEN
    CREATE POLICY "Allow anon delete purchase_invoice_items"
      ON purchase_invoice_items
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Función que revierte el stock al eliminar un item de factura de compra
CREATE OR REPLACE FUNCTION revert_stock_on_purchase_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_stock numeric;
  v_new_stock numeric;
BEGIN
  SELECT stock INTO v_current_stock
  FROM products
  WHERE id = OLD.product_id;

  v_new_stock := COALESCE(v_current_stock, 0) - OLD.quantity;

  UPDATE products
  SET stock = v_new_stock
  WHERE id = OLD.product_id;

  RETURN OLD;
END;
$$;

-- Trigger que dispara la reversión de stock antes de eliminar cada item
DROP TRIGGER IF EXISTS trg_revert_stock_on_purchase_delete ON purchase_invoice_items;
CREATE TRIGGER trg_revert_stock_on_purchase_delete
BEFORE DELETE ON purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION revert_stock_on_purchase_delete();
