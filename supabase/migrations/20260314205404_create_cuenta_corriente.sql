/*
  # Módulo de Cuenta Corriente

  ## Descripción
  Crea las tablas necesarias para gestionar cuentas corrientes de clientes.
  Permite registrar ventas a crédito y pagos parciales o totales.

  ## Nuevas Tablas

  ### customer_accounts (Cuentas de clientes)
  - id: identificador único
  - customer_name: nombre del cliente
  - customer_lot: lote del cliente
  - total_debt: deuda total acumulada
  - created_at / updated_at: timestamps

  ### current_account_transactions (Movimientos de cuenta corriente)
  - id: identificador único
  - customer_account_id: referencia a la cuenta del cliente
  - customer_name / customer_lot: desnormalizados para consultas rápidas
  - type: 'cargo' (venta a crédito) | 'pago' (pago recibido)
  - amount: monto del movimiento
  - balance_after: saldo después del movimiento
  - sale_id / sale_number: referencia a la venta origen (para cargos)
  - payment_method: método con que pagó (para pagos)
  - description: descripción del movimiento
  - user_name: usuario que registró
  - shift_id: turno en que se registró
  - created_at: timestamp

  ## Seguridad
  - RLS habilitado en ambas tablas
  - Políticas permiten acceso a usuarios anónimos (el sistema usa anon key sin auth de usuario)
*/

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_lot text NOT NULL DEFAULT '',
  total_debt numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS current_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id uuid NOT NULL REFERENCES customer_accounts(id),
  customer_name text NOT NULL,
  customer_lot text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('cargo', 'pago')),
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  sale_id uuid,
  sale_number text,
  payment_method text,
  description text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  shift_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_account_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read customer_accounts"
  ON customer_accounts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert customer_accounts"
  ON customer_accounts FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update customer_accounts"
  ON customer_accounts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon read current_account_transactions"
  ON current_account_transactions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert current_account_transactions"
  ON current_account_transactions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_name ON customer_accounts(customer_name);
CREATE INDEX IF NOT EXISTS idx_current_account_transactions_account ON current_account_transactions(customer_account_id);
CREATE INDEX IF NOT EXISTS idx_current_account_transactions_created ON current_account_transactions(created_at);
