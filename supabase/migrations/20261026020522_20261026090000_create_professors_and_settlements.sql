/*
# Módulo de profesores y liquidación de clases

1. Nuevas tablas
- `professors`: profesores, datos de contacto, comisión predeterminada y estado activo/inactivo.
- `professor_classes`: una fila histórica por clase facturada, vinculada a la venta, producto, cancha/turno y profesor. Guarda el importe cobrado y el porcentaje realmente usado.
- `professor_settlements`: liquidaciones confirmadas por profesor y período, con total facturado, comisión y saldo pendiente.
- `professor_settlement_items`: detalle inmutable de las clases incluidas en cada liquidación.
- `professor_settlement_payments`: pagos totales o parciales realizados a una liquidación.

2. Cambios en tablas existentes
- `products.requires_professor`: indica si un producto exige seleccionar profesor y genera comisión.
- Los cinco productos actuales de categoría Clases quedan activados automáticamente por sus nombres.

3. Seguridad e integridad
- Todas las tablas nuevas tienen RLS habilitado, grants explícitos y políticas separadas de lectura, alta, modificación y baja para la aplicación single-tenant existente.
- Las funciones de generar liquidaciones y registrar pagos son SECURITY DEFINER, validan importes y bloquean filas para evitar doble liquidación o pagos superiores al saldo.
- No se borran ventas, productos ni datos históricos.

4. Estados
- Una clase puede estar `pendiente`, `pagada` o `anulada` respecto del cobro.
- Una clase puede estar `pendiente`, `liquidada` o `anulada` respecto de la liquidación.
- Una liquidación puede estar `pendiente_pago`, `pagada_parcial` o `pagada`.
*/

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_professor boolean NOT NULL DEFAULT false;
UPDATE public.products
SET requires_professor = true, updated_at = now()
WHERE lower(name) IN ('clase x1', 'clase x2', 'clase x3', 'clase x4', 'escuelita')
   OR lower(name) IN ('clase por 1', 'clase por 2', 'clase por 3', 'clase por 4');

CREATE TABLE IF NOT EXISTS public.professors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  commission_rate numeric(5,2) NOT NULL DEFAULT 40 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.professor_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES public.professors(id),
  professor_name text NOT NULL,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  sale_id uuid REFERENCES public.sales(id),
  sale_number text NOT NULL DEFAULT '',
  court_session_id uuid REFERENCES public.court_sessions(id),
  court smallint,
  class_date date NOT NULL DEFAULT current_date,
  class_time time,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  gross_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  collected_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
  commission_rate numeric(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  commission_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  collection_status text NOT NULL DEFAULT 'paid' CHECK (collection_status IN ('pendiente','pagada','anulada')),
  settlement_status text NOT NULL DEFAULT 'pendiente' CHECK (settlement_status IN ('pendiente','liquidada','anulada')),
  settlement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professor_classes_lookup ON public.professor_classes(professor_id, class_date, settlement_status);
CREATE INDEX IF NOT EXISTS idx_professor_classes_sale ON public.professor_classes(sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_professor_classes_sale_product_professor
  ON public.professor_classes(sale_id, product_id, professor_id, court_session_id);

CREATE TABLE IF NOT EXISTS public.professor_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number bigint GENERATED ALWAYS AS IDENTITY,
  professor_id uuid NOT NULL REFERENCES public.professors(id),
  professor_name text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  total_gross numeric(12,2) NOT NULL DEFAULT 0,
  total_commission numeric(12,2) NOT NULL DEFAULT 0,
  total_paid numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente_pago' CHECK (status IN ('pendiente_pago','pagada_parcial','pagada','anulada')),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_to >= period_from)
);

CREATE TABLE IF NOT EXISTS public.professor_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.professor_settlements(id),
  professor_class_id uuid NOT NULL UNIQUE REFERENCES public.professor_classes(id),
  gross_amount numeric(12,2) NOT NULL,
  commission_rate numeric(5,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.professor_settlement_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.professor_settlements(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo','transferencia')),
  notes text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  shift_id uuid REFERENCES public.shifts(id),
  cash_transaction_id uuid REFERENCES public.cash_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professor_classes_settlement_fk') THEN
    ALTER TABLE public.professor_classes ADD CONSTRAINT professor_classes_settlement_fk
      FOREIGN KEY (settlement_id) REFERENCES public.professor_settlements(id);
  END IF;
END $$;

ALTER TABLE public.professors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professor_settlement_payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professors TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professor_classes TO anon, authenticated;
GRANT SELECT ON public.professor_settlements TO anon, authenticated;
GRANT SELECT ON public.professor_settlement_items TO anon, authenticated;
GRANT SELECT ON public.professor_settlement_payments TO anon, authenticated;
GRANT UPDATE (requires_professor) ON public.products TO anon, authenticated;

DROP POLICY IF EXISTS "professors_select" ON public.professors;
CREATE POLICY "professors_select" ON public.professors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "professors_insert" ON public.professors;
CREATE POLICY "professors_insert" ON public.professors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "professors_update" ON public.professors;
CREATE POLICY "professors_update" ON public.professors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "professors_delete" ON public.professors;
CREATE POLICY "professors_delete" ON public.professors FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "professor_classes_select" ON public.professor_classes;
CREATE POLICY "professor_classes_select" ON public.professor_classes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "professor_classes_insert" ON public.professor_classes;
CREATE POLICY "professor_classes_insert" ON public.professor_classes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "professor_classes_update" ON public.professor_classes;
CREATE POLICY "professor_classes_update" ON public.professor_classes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "professor_classes_delete" ON public.professor_classes;
CREATE POLICY "professor_classes_delete" ON public.professor_classes FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "professor_settlements_select" ON public.professor_settlements;
CREATE POLICY "professor_settlements_select" ON public.professor_settlements FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "professor_settlement_items_select" ON public.professor_settlement_items;
CREATE POLICY "professor_settlement_items_select" ON public.professor_settlement_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "professor_settlement_payments_select" ON public.professor_settlement_payments;
CREATE POLICY "professor_settlement_payments_select" ON public.professor_settlement_payments FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.generate_professor_settlement(
  p_professor_id uuid, p_period_from date, p_period_to date, p_class_ids uuid[], p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_settlement_id uuid;
  v_name text;
  v_total_gross numeric(12,2);
  v_total_commission numeric(12,2);
BEGIN
  IF p_period_to < p_period_from OR p_class_ids IS NULL OR coalesce(array_length(p_class_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'invalid_settlement';
  END IF;
  SELECT name INTO v_name FROM public.professors WHERE id = p_professor_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'professor_not_found'; END IF;

  PERFORM 1 FROM public.professor_classes
  WHERE id = ANY(p_class_ids)
    AND professor_id = p_professor_id
    AND class_date BETWEEN p_period_from AND p_period_to
    AND collection_status = 'pagada'
    AND settlement_status = 'pendiente'
  FOR UPDATE;
  IF (SELECT count(*) FROM public.professor_classes WHERE id = ANY(p_class_ids) AND professor_id = p_professor_id AND class_date BETWEEN p_period_from AND p_period_to AND collection_status = 'pagada' AND settlement_status = 'pendiente') <> array_length(p_class_ids, 1) THEN
    RAISE EXCEPTION 'class_not_available';
  END IF;

  SELECT coalesce(sum(collected_amount),0), coalesce(sum(commission_amount),0)
  INTO v_total_gross, v_total_commission
  FROM public.professor_classes WHERE id = ANY(p_class_ids);

  INSERT INTO public.professor_settlements(professor_id, professor_name, period_from, period_to, total_gross, total_commission, created_by)
  VALUES (p_professor_id, v_name, p_period_from, p_period_to, v_total_gross, v_total_commission, coalesce(p_user,''))
  RETURNING id INTO v_settlement_id;

  INSERT INTO public.professor_settlement_items(settlement_id, professor_class_id, gross_amount, commission_rate, commission_amount)
  SELECT v_settlement_id, id, collected_amount, commission_rate, commission_amount
  FROM public.professor_classes WHERE id = ANY(p_class_ids);

  UPDATE public.professor_classes SET settlement_status = 'liquidada', settlement_id = v_settlement_id, updated_at = now()
  WHERE id = ANY(p_class_ids);
  RETURN v_settlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_professor_payment(
  p_settlement_id uuid, p_amount numeric, p_payment_date date, p_payment_method text, p_notes text, p_user text, p_shift_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_remaining numeric(12,2);
  v_payment_id uuid;
  v_cash_id uuid;
  v_professor text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_payment_method NOT IN ('efectivo','transferencia') THEN RAISE EXCEPTION 'invalid_payment'; END IF;
  SELECT total_commission, total_paid, professor_name INTO v_total, v_paid, v_professor
  FROM public.professor_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_not_found'; END IF;
  IF v_paid + p_amount > v_total + 0.01 THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;
  v_remaining := v_total - v_paid;
  INSERT INTO public.cash_transactions(shift_id, type, category, amount, payment_method, description)
  VALUES (p_shift_id, 'expense', 'liquidacion_profesor', p_amount, p_payment_method, 'Pago a profesor - ' || v_professor)
  RETURNING id INTO v_cash_id;
  INSERT INTO public.professor_settlement_payments(settlement_id, amount, payment_date, payment_method, notes, user_name, shift_id, cash_transaction_id)
  VALUES (p_settlement_id, p_amount, coalesce(p_payment_date, current_date), p_payment_method, coalesce(p_notes,''), coalesce(p_user,''), p_shift_id, v_cash_id)
  RETURNING id INTO v_payment_id;
  UPDATE public.professor_settlements SET total_paid = total_paid + p_amount,
    status = CASE WHEN total_paid + p_amount >= total_commission - 0.01 THEN 'pagada' ELSE 'pagada_parcial' END,
    updated_at = now() WHERE id = p_settlement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_professor_settlement(uuid, date, date, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_professor_settlement(uuid, date, date, uuid[], text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.register_professor_payment(uuid, numeric, date, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_professor_payment(uuid, numeric, date, text, text, text, uuid) TO anon, authenticated;
