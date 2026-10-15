/*
# Eliminar cargos de cuenta corriente (Súper Administrador)

1. Nueva función
- `delete_current_account_charge(p_transaction_id uuid, p_admin_key text)`
  - Verifica la clave de Súper Administrador en el servidor (se compara contra un hash, la clave no se guarda en texto plano).
  - Solo permite eliminar movimientos de tipo 'cargo' (deudas).
  - Resta el monto de la deuda total del cliente (sin bajar de 0).
  - Ajusta el "saldo después" de los movimientos posteriores de ese cliente.
  - Elimina el movimiento de caja "[Cuenta Corriente]" asociado a esa venta, para que la tarjeta Cta. Corriente de Caja quede consistente.
  - Elimina el movimiento de cuenta corriente.
  - Devuelve el nuevo saldo del cliente.

2. Seguridad
- No se agregan políticas DELETE: la única forma de borrar es a través de esta función, que exige la clave.
- SECURITY DEFINER con search_path vacío; EXECUTE revocado de PUBLIC y otorgado a anon/authenticated (la app no usa login de Supabase).
*/

CREATE OR REPLACE FUNCTION public.delete_current_account_charge(p_transaction_id uuid, p_admin_key text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash constant text := '$2a$10$0/xulHNPC7vx/yusI3v1dOXOlP/bDJDE8V1yKG0YfRWVmB1Mg6CBa';
  v_tx public.current_account_transactions%ROWTYPE;
  v_new_debt numeric;
BEGIN
  IF p_admin_key IS NULL OR extensions.crypt(p_admin_key, v_hash) <> v_hash THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;

  SELECT * INTO v_tx FROM public.current_account_transactions
  WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_tx.type <> 'cargo' THEN
    RAISE EXCEPTION 'only_charges';
  END IF;

  UPDATE public.customer_accounts
  SET total_debt = GREATEST(total_debt - v_tx.amount, 0),
      updated_at = now()
  WHERE id = v_tx.customer_account_id
  RETURNING total_debt INTO v_new_debt;

  UPDATE public.current_account_transactions
  SET balance_after = GREATEST(balance_after - v_tx.amount, 0)
  WHERE customer_account_id = v_tx.customer_account_id
    AND created_at > v_tx.created_at;

  IF v_tx.sale_number IS NOT NULL THEN
    DELETE FROM public.cash_transactions
    WHERE id = (
      SELECT id FROM public.cash_transactions
      WHERE payment_method = 'cuenta_corriente'
        AND type = 'income'
        AND description LIKE 'Venta ' || v_tx.sale_number || ' %'
        AND (v_tx.shift_id IS NULL OR shift_id = v_tx.shift_id)
      ORDER BY created_at
      LIMIT 1
    );
  END IF;

  DELETE FROM public.current_account_transactions WHERE id = v_tx.id;

  RETURN v_new_debt;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_current_account_charge(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_current_account_charge(uuid, text) TO anon, authenticated;
