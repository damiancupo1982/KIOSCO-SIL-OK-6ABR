/*
# Socios externos + historial permanente de carnets

1. Modified Tables
- `socios`
  - `tipo_socio` (text, NOT NULL, default 'INTERNO'): INTERNO (pertenece a un lote SIL) o EXTERNO (sin lote, nunca se liquida al barrio).
  - `external_id` (text, unique): identificador automatico EXT-0001, EXT-0002... solo para externos.
  - `barrio_id` ahora admite vacio (los externos no tienen barrio).
  - `carnet_status` admite ahora 'baja' ademas de 'activo' y 'pausado'.
  - Regla: INTERNO requiere barrio y lote; EXTERNO va sin lote.

2. New Tables
- `carnet_status_history`: registro permanente de cada pausa, baja o reactivacion.
  - socio_id, socio_name, lot_number, external_id, tipo_socio, category, barrio_id,
    previous_status, new_status, action (PAUSADO/BAJA/REACTIVADO), reason, user_name, created_at.
  - Sin clave foranea a socios, para que el historial sobreviva aunque el socio cambie.

3. Functions
- `socios_assign_external_id` (trigger): asigna EXT-XXXX al crear/convertir un externo.
- `log_carnet_status_change` (trigger): escribe el historial ante cualquier cambio de estado.
- `change_carnet_status(p_socio_id, p_new_status, p_reason, p_user)`: RPC usada por la app;
  registra operador y motivo.

4. Security
- RLS habilitado en `carnet_status_history`, solo lectura para la app. No hay politicas de
  insert/update/delete: el historial nunca puede modificarse ni borrarse desde la app.
- Las funciones de trigger no son ejecutables por anon/authenticated.
*/

ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS tipo_socio text NOT NULL DEFAULT 'INTERNO';
ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.socios ALTER COLUMN barrio_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'socios_tipo_socio_check') THEN
    ALTER TABLE public.socios ADD CONSTRAINT socios_tipo_socio_check CHECK (tipo_socio IN ('INTERNO','EXTERNO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'socios_external_id_key') THEN
    ALTER TABLE public.socios ADD CONSTRAINT socios_external_id_key UNIQUE (external_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'socios_tipo_lote_check') THEN
    ALTER TABLE public.socios ADD CONSTRAINT socios_tipo_lote_check CHECK (
      (tipo_socio = 'INTERNO' AND barrio_id IS NOT NULL AND btrim(lot_number) <> '')
      OR (tipo_socio = 'EXTERNO' AND btrim(lot_number) = '')
    );
  END IF;
END $$;

ALTER TABLE public.socios DROP CONSTRAINT IF EXISTS socios_carnet_status_check;
ALTER TABLE public.socios ADD CONSTRAINT socios_carnet_status_check CHECK (carnet_status IN ('activo','pausado','baja'));

CREATE SEQUENCE IF NOT EXISTS public.socios_external_seq;

CREATE OR REPLACE FUNCTION public.socios_assign_external_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.tipo_socio = 'EXTERNO' THEN
    NEW.lot_number := '';
    NEW.barrio_id := NULL;
    IF NEW.external_id IS NULL OR btrim(NEW.external_id) = '' THEN
      NEW.external_id := 'EXT-' || lpad(nextval('public.socios_external_seq')::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_socios_assign_external_id ON public.socios;
CREATE TRIGGER trg_socios_assign_external_id
  BEFORE INSERT OR UPDATE OF tipo_socio, external_id ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.socios_assign_external_id();

CREATE TABLE IF NOT EXISTS public.carnet_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL,
  socio_name text NOT NULL DEFAULT '',
  lot_number text NOT NULL DEFAULT '',
  external_id text,
  tipo_socio text NOT NULL DEFAULT 'INTERNO',
  category text NOT NULL DEFAULT '',
  barrio_id uuid,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  action text NOT NULL CHECK (action IN ('PAUSADO','BAJA','REACTIVADO')),
  reason text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carnet_history_created_at ON public.carnet_status_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carnet_history_socio ON public.carnet_status_history (socio_id);

ALTER TABLE public.carnet_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read carnet history" ON public.carnet_status_history;
CREATE POLICY "Read carnet history" ON public.carnet_status_history FOR SELECT
  TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.carnet_status_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_carnet_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.carnet_status IS DISTINCT FROM OLD.carnet_status THEN
    INSERT INTO public.carnet_status_history (
      socio_id, socio_name, lot_number, external_id, tipo_socio, category, barrio_id,
      previous_status, new_status, action, reason, user_name
    ) VALUES (
      NEW.id, btrim(NEW.first_name || ' ' || NEW.last_name), NEW.lot_number, NEW.external_id,
      NEW.tipo_socio, NEW.category, NEW.barrio_id, OLD.carnet_status, NEW.carnet_status,
      CASE NEW.carnet_status WHEN 'pausado' THEN 'PAUSADO' WHEN 'baja' THEN 'BAJA' ELSE 'REACTIVADO' END,
      coalesce(nullif(current_setting('app.carnet_reason', true), ''), ''),
      coalesce(nullif(current_setting('app.carnet_user', true), ''), 'Sistema')
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_socios_log_status ON public.socios;
CREATE TRIGGER trg_socios_log_status
  AFTER UPDATE OF carnet_status ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.log_carnet_status_change();

REVOKE EXECUTE ON FUNCTION public.socios_assign_external_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_carnet_status_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.change_carnet_status(p_socio_id uuid, p_new_status text, p_reason text, p_user text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_current text;
BEGIN
  IF p_new_status NOT IN ('activo','pausado','baja') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  SELECT carnet_status INTO v_current FROM public.socios WHERE id = p_socio_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'socio_not_found';
  END IF;
  IF v_current = p_new_status THEN
    RAISE EXCEPTION 'same_status';
  END IF;
  PERFORM set_config('app.carnet_reason', left(coalesce(btrim(p_reason), ''), 500), true);
  PERFORM set_config('app.carnet_user', left(coalesce(btrim(p_user), ''), 120), true);
  UPDATE public.socios SET carnet_status = p_new_status, updated_at = now() WHERE id = p_socio_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.change_carnet_status(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_carnet_status(uuid, text, text, text) TO anon, authenticated;
