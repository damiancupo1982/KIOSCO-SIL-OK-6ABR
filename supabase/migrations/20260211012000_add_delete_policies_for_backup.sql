/*
  # Agregar políticas de DELETE para restauración de backups

  1. Cambios
    - Agregar políticas DELETE para tablas que no las tienen
    - Permite eliminar datos durante la restauración de backups
  
  2. Tablas afectadas
    - cash_transactions
    - configuration
    - inventory_movements
    - sales
    - shifts
  
  3. Seguridad
    - Permite a usuarios anon y authenticated eliminar registros
    - Necesario para la funcionalidad de restauración de backups
*/

-- Política DELETE para cash_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cash_transactions' 
    AND policyname = 'Anyone can delete cash_transactions'
  ) THEN
    CREATE POLICY "Anyone can delete cash_transactions"
      ON cash_transactions
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Política DELETE para configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'configuration' 
    AND policyname = 'Anyone can delete configuration'
  ) THEN
    CREATE POLICY "Anyone can delete configuration"
      ON configuration
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Política DELETE para inventory_movements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'inventory_movements' 
    AND policyname = 'Anyone can delete inventory_movements'
  ) THEN
    CREATE POLICY "Anyone can delete inventory_movements"
      ON inventory_movements
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Política DELETE para sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sales' 
    AND policyname = 'Anyone can delete sales'
  ) THEN
    CREATE POLICY "Anyone can delete sales"
      ON sales
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Política DELETE para shifts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shifts' 
    AND policyname = 'Anyone can delete shifts'
  ) THEN
    CREATE POLICY "Anyone can delete shifts"
      ON shifts
      FOR DELETE
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
