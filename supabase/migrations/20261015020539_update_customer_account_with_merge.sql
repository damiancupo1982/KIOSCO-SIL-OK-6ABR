/*
# Editar nombre/lote de cuentas corrientes (con unión de duplicados)

1. Nueva función
- `update_customer_account(p_account_id uuid, p_name text, p_lot text)`
  - Cambia el nombre y el lote de una cuenta corriente.
  - Actualiza el nombre/lote en todos sus movimientos y en las ventas asociadas.
  - Si ya existe OTRA cuenta con el mismo nombre (sin distinguir mayúsculas) y el mismo lote,
    une ambas: mueve todos los movimientos a la cuenta existente, suma las deudas,
    recalcula el saldo de cada movimiento en orden cronológico y elimina la cuenta duplicada.
  - Devuelve el id de la cuenta resultante.

2. Seguridad
- SECURITY DEFINER con search_path vacío (los movimientos no tienen política UPDATE directa).
- EXECUTE revocado de PUBLIC y otorgado a anon/authenticated (la app no usa login de Supabase).
*/

CREATE OR REPLACE FUNCTION public.update_customer_account(p_account_id uuid, p_name text, p_lot text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_lot text := btrim(coalesce(p_lot, ''));
  v_source public.customer_accounts%ROWTYPE;
  v_target_id uuid;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  SELECT * INTO v_source FROM public.customer_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT id INTO v_target_id FROM public.customer_accounts
  WHERE id <> p_account_id
    AND lower(btrim(customer_name)) = lower(v_name)
    AND btrim(customer_lot) = v_lot
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_target_id IS NULL THEN
    v_target_id := p_account_id;
    UPDATE public.customer_accounts
    SET customer_name = v_name, customer_lot = v_lot, updated_at = now()
    WHERE id = v_target_id;
  ELSE
    UPDATE public.current_account_transactions
    SET customer_account_id = v_target_id
    WHERE customer_account_id = p_account_id;

    UPDATE public.customer_accounts
    SET customer_name = v_name,
        customer_lot = v_lot,
        total_debt = total_debt + v_source.total_debt,
        updated_at = now()
    WHERE id = v_target_id;

    DELETE FROM public.customer_accounts WHERE id = p_account_id;

    UPDATE public.current_account_transactions t
    SET balance_after = r.running
    FROM (
      SELECT id, GREATEST(SUM(CASE WHEN type = 'cargo' THEN amount ELSE -amount END)
        OVER (ORDER BY created_at, id), 0) AS running
      FROM public.current_account_transactions
      WHERE customer_account_id = v_target_id
    ) r
    WHERE t.id = r.id;
  END IF;

  UPDATE public.current_account_transactions
  SET customer_name = v_name, customer_lot = v_lot
  WHERE customer_account_id = v_target_id;

  UPDATE public.sales
  SET customer_name = v_name, customer_lot = v_lot
  WHERE id IN (
    SELECT sale_id FROM public.current_account_transactions
    WHERE customer_account_id = v_target_id AND sale_id IS NOT NULL
  );

  RETURN v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_customer_account(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_customer_account(uuid, text, text) TO anon, authenticated;
