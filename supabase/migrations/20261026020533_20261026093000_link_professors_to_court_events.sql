/*
# Vincular profesores con agenda y turnos

1. Cambios en `court_reservations`
- Agrega `professor_id` para conservar la relación estable con el profesor elegido.
- Mantiene el texto `professor` existente para no perder datos históricos.

2. Cambios en `court_sessions`
- Agrega tipo de evento, profesor y nombre del profesor copiado al abrir el turno.
- Esto evita depender de una reserva que luego puede cambiar o cancelarse.

3. Funciones
- Agrega versiones de `save_court_event`, `open_court_session` y `open_played_court_session` que reciben profesor.
- Las versiones anteriores se conservan para compatibilidad con la aplicación.
*/

ALTER TABLE public.court_reservations ADD COLUMN IF NOT EXISTS professor_id uuid REFERENCES public.professors(id);
ALTER TABLE public.court_sessions ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'reserva';
ALTER TABLE public.court_sessions ADD COLUMN IF NOT EXISTS professor_id uuid REFERENCES public.professors(id);
ALTER TABLE public.court_sessions ADD COLUMN IF NOT EXISTS professor_name text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_court_sessions_professor ON public.court_sessions(professor_id, opened_at);

CREATE OR REPLACE FUNCTION public.save_court_event(
  p_group_id uuid, p_event_type text, p_courts smallint[], p_date date, p_start time, p_end time,
  p_titular_name text, p_titular_lot text, p_title text, p_professor text, p_student text,
  p_notes text, p_professor_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_group uuid;
BEGIN
  IF p_event_type = 'clase' AND p_professor_id IS NULL THEN RAISE EXCEPTION 'professor_required'; END IF;
  v_group := public.save_court_event(
    p_group_id, p_event_type, p_courts, p_date, p_start, p_end, p_titular_name, p_titular_lot,
    p_title, p_professor, p_student, p_notes, p_user
  );
  UPDATE public.court_reservations
  SET professor_id = CASE WHEN p_event_type = 'clase' THEN p_professor_id ELSE NULL END,
      professor = CASE WHEN p_event_type = 'clase' THEN coalesce(btrim(p_professor), '') ELSE '' END,
      updated_at = now()
  WHERE event_group = v_group AND status = 'reservada';
  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_court_session(
  p_court smallint, p_reservation_id uuid, p_players jsonb,
  p_titular_name text, p_titular_lot text, p_titular_socio_id uuid, p_professor_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_event_type text := 'reserva';
  v_professor_name text := '';
BEGIN
  IF p_reservation_id IS NOT NULL THEN
    SELECT event_type, coalesce(professor, '') INTO v_event_type, v_professor_name
    FROM public.court_reservations WHERE id = p_reservation_id;
  END IF;
  v_id := public.open_court_session(
    p_court, p_reservation_id, p_players, p_titular_name, p_titular_lot, p_titular_socio_id, p_user
  );
  UPDATE public.court_sessions
  SET event_type = coalesce(v_event_type, 'reserva'), professor_id = p_professor_id,
      professor_name = coalesce(v_professor_name, '')
  WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_played_court_session(
  p_court smallint, p_date date, p_start time, p_end time, p_reservation_id uuid, p_players jsonb,
  p_titular_name text, p_titular_lot text, p_titular_socio_id uuid, p_professor_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_professor_name text := '';
BEGIN
  IF p_reservation_id IS NOT NULL THEN
    SELECT coalesce(professor, '') INTO v_professor_name FROM public.court_reservations WHERE id = p_reservation_id;
  END IF;
  v_id := public.open_played_court_session(
    p_court, p_date, p_start, p_end, p_reservation_id, p_players, p_titular_name,
    p_titular_lot, p_titular_socio_id, p_user
  );
  UPDATE public.court_sessions
  SET event_type = CASE WHEN p_reservation_id IS NOT NULL THEN 'reserva' ELSE event_type END,
      professor_id = p_professor_id, professor_name = coalesce(v_professor_name, '')
  WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_court_event(uuid, text, smallint[], date, time, time, text, text, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_court_event(uuid, text, smallint[], date, time, time, text, text, text, text, text, text, uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.open_court_session(smallint, uuid, jsonb, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_court_session(smallint, uuid, jsonb, text, text, uuid, uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.open_played_court_session(smallint, date, time, time, uuid, jsonb, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_played_court_session(smallint, date, time, time, uuid, jsonb, text, text, uuid, uuid, text) TO anon, authenticated;
