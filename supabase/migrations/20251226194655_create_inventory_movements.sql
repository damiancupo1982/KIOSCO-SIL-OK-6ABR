/*
  # Crear tabla de movimientos de inventario

  1. Nueva Tabla
    - `inventory_movements`
      - `id` (uuid, primary key)
      - `product_id` (uuid, referencia a products)
      - `product_name` (text)
      - `product_category` (text)
      - `type` ('entrada' | 'salida')
      - `quantity` (integer)
      - `reason` (text: 'compra_proveedor', 'venta', 'ajuste', 'devolucion')
      - `supplier` (text, opcional - nombre del proveedor)
      - `user_name` (text)
      - `notes` (text, opcional)
      - `created_at` (timestamp)

  2. Seguridad
    - Habilitar RLS en `inventory_movements`
    - Permitir lectura a todos los usuarios autenticados
    - Permitir inserción a todos los usuarios autenticados
*/

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_category text DEFAULT '',
  type text NOT NULL CHECK (type IN ('entrada', 'salida')),
  quantity integer NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'ajuste',
  supplier text DEFAULT '',
  user_name text NOT NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver todos los movimientos"
  ON inventory_movements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios pueden crear movimientos"
  ON inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios pueden ver movimientos sin autenticar"
  ON inventory_movements FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Usuarios pueden crear movimientos sin autenticar"
  ON inventory_movements FOR INSERT
  TO anon
  WITH CHECK (true);