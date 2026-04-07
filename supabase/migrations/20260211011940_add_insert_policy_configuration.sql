/*
  # Agregar política de INSERT para tabla configuration

  1. Cambios
    - Agregar política INSERT para usuarios anon y authenticated
    - Permite restaurar backups correctamente
  
  2. Seguridad
    - Permite a cualquier usuario autenticado o anónimo insertar en configuration
    - Necesario para la funcionalidad de restauración de backups
*/

-- Crear política de INSERT para configuration si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'configuration' 
    AND policyname = 'Anyone can insert configuration'
  ) THEN
    CREATE POLICY "Anyone can insert configuration"
      ON configuration
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $$;
