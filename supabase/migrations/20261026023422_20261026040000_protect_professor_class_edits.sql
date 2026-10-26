/*
# Protect professor class edits and deletions

1. New database functions
- `edit_professor_class`: edits the professor, date, amounts, and commission of a pending class after validating the superadministrator key.
- `delete_professor_class`: removes a pending class after validating the superadministrator key.

2. Modified permissions
- Direct UPDATE and DELETE access on `professor_classes` is revoked from the browser roles.
- The two controlled functions are executable by the existing single-tenant browser roles.

3. Security and integrity
- Both functions run with database privileges and validate the supplied key server-side.
- Only classes with `settlement_status = 'pendiente'` can be changed or removed.
- Commission amount is recalculated from the collected amount and commission rate.
- Already-liquidated classes and classes with invalid values remain protected.

4. Important notes
- No sales, products, settlements, payments, or other history are deleted.
- The existing application has no user sign-in, so the functions are callable by the current browser roles but still require the superadministrator key.
*/

CREATE OR REPLACE FUNCTION public.edit_professor_class(
  p_class_id uuid,
  p_professor_id uuid,
  p_class_date date,
  p_gross_amount numeric,
  p_collected_amount numeric,
  p_commission_rate numeric,
  p_superadmin_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professor_name text;
BEGIN
  IF p_superadmin_key IS DISTINCT FROM '842114' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_class_date IS NULL
    OR p_gross_amount IS NULL OR p_gross_amount < 0
    OR p_collected_amount IS NULL OR p_collected_amount < 0
    OR p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 100 THEN
    RAISE EXCEPTION 'invalid_class_values';
  END IF;

  SELECT name INTO v_professor_name
  FROM public.professors
  WHERE id = p_professor_id AND active = true;
  IF v_professor_name IS NULL THEN
    RAISE EXCEPTION 'professor_not_found';
  END IF;

  UPDATE public.professor_classes
  SET professor_id = p_professor_id,
      professor_name = v_professor_name,
      class_date = p_class_date,
      gross_amount = p_gross_amount,
      collected_amount = p_collected_amount,
      commission_rate = p_commission_rate,
      commission_amount = p_collected_amount * p_commission_rate / 100,
      updated_at = now()
  WHERE id = p_class_id
    AND settlement_status = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class_not_editable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_professor_class(
  p_class_id uuid,
  p_superadmin_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_superadmin_key IS DISTINCT FROM '842114' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.professor_classes
  WHERE id = p_class_id
    AND settlement_status = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class_not_deletable';
  END IF;
END;
$$;

REVOKE UPDATE, DELETE ON public.professor_classes FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_professor_class(uuid, uuid, date, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_professor_class(uuid, uuid, date, numeric, numeric, numeric, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_professor_class(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_professor_class(uuid, text) TO anon, authenticated;