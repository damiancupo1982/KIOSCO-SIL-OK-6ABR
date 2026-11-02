/*
# Zero out a payment method balance (VALORES A 0)

1. New database function
- `zero_cash_method_balance(p_payment_method, p_superadmin_key)`: for `transferencia`, `qr` or `expensas`, it validates the superadministrator key, calculates the full historical balance (all income minus all expenses for that method), and records one expense movement for that exact amount in the open shift, leaving the balance at 0.

2. Security
- The key is validated on the server against the superadministrator key.
- The amount is calculated on the server, never taken from the browser.
- EXECUTE is revoked from PUBLIC and granted only to the existing browser roles, following the same pattern as the professor class functions.

3. Important notes
- If the balance is already 0 nothing is recorded.
- If the balance is negative, nothing is recorded, because an expense cannot bring a negative balance to 0.
- The function requires an open shift to attach the movement to.
- No existing movements are modified or deleted.
*/

CREATE OR REPLACE FUNCTION public.zero_cash_method_balance(
  p_payment_method text,
  p_superadmin_key text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance numeric;
  v_shift_id uuid;
BEGIN
  IF p_superadmin_key IS DISTINCT FROM '842114' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_payment_method NOT IN ('transferencia', 'qr', 'expensas') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
  INTO v_balance
  FROM public.cash_transactions
  WHERE payment_method = p_payment_method;

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'negative_balance';
  END IF;

  IF v_balance = 0 THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_shift_id
  FROM public.shifts
  WHERE active = true
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'no_open_shift';
  END IF;

  INSERT INTO public.cash_transactions (shift_id, type, category, amount, payment_method, description)
  VALUES (
    v_shift_id,
    'expense',
    'VALORES A 0',
    v_balance,
    p_payment_method,
    'Ajuste para dejar el saldo de ' || p_payment_method || ' en 0'
  );

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.zero_cash_method_balance(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zero_cash_method_balance(text, text) TO anon, authenticated;
