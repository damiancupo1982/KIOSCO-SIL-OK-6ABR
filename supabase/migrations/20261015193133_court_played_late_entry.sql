/*
# Carga posterior de turnos jugados ("Reserva jugada")

Permite registrar al día siguiente un turno que se jugó cuando no había empleada (complejo autónomo),
indicando cancha, fecha, hora de inicio y de fin, jugadores y consumos.

1. Cambios en `court_sessions`
- `is_late_entry` (boolean, default false): el turno se cargó después de jugado.
- `planned_end` (timestamptz): hora real de fin indicada al cargarlo. Al cerrarlo, `closed_at` toma este valor.

2. Índice de "un turno abierto por cancha"
- Se recrea `uq_court_open_session` para que solo aplique a turnos en juego reales:
  una carga posterior no bloquea la cancha en este momento (ni al revés). No se borran datos.

3. Funciones
- `open_played_court_session(...)`: crea la carga posterior. Valida horario (fin posterior al inicio y no
  posterior a la hora actual) y superposición con la agenda y otros turnos. Puede vincular una reserva
  pendiente de ese horario (queda como jugada al cerrar).
- `discard_played_court_session(id)`: descarta una carga posterior no cerrada.
- `find_court_conflict`: una carga posterior abierta ocupa de su inicio a su fin indicado.
- `open_court_session`: ignora cargas posteriores al verificar si la cancha ya tiene un turno abierto.
- `close_court_session_free` y trigger de ventas: si es carga posterior, el cierre queda en la hora de fin indicada.

4. Seguridad
- Las funciones nuevas son SECURITY DEFINER con search_path vacío; ejecutables por anon/authenticated
  porque la app usa login propio (sin Supabase Auth).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_sessions' AND column_name='is_late_entry') THEN
    ALTER TABLE court_sessions ADD COLUMN is_late_entry boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='court_sessions' AND column_name='planned_end') THEN
    ALTER TABLE court_sessions ADD COLUMN planned_end timestamptz;
  END IF;
END $$;

DROP INDEX IF EXISTS uq_court_open_session;
CREATE UNIQUE INDEX IF NOT EXISTS uq_court_open_session ON court_sessions(court) WHERE status = 'abierta' AND NOT is_late_entry;

CREATE OR REPLACE FUNCTION public.find_court_conflict(
  p_court smallint, p_start timestamp, p_end timestamp, p_exclude_id uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT to_char(x.s, 'HH24:MI') || '-' || to_char(x.e, 'HH24:MI')
  FROM (
    SELECT (r.reservation_date + r.start_time) AS s, (r.reservation_date + r.end_time) AS e
    FROM public.court_reservations r
    WHERE r.court = p_court AND r.status IN ('reservada','abierta')
      AND r.id IS DISTINCT FROM p_exclude_id
    UNION ALL
    SELECT (cs.opened_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
           (coalesce(cs.closed_at,
                     CASE WHEN cs.is_late_entry THEN cs.planned_end END,
                     greatest(now(), cs.opened_at) + interval '1 minute') AT TIME ZONE 'America/Argentina/Buenos_Aires')
    FROM public.court_sessions cs
    WHERE cs.court = p_court AND cs.status IN ('abierta','cerrada')
      AND cs.reservation_id IS DISTINCT FROM p_exclude_id
  ) x
  WHERE x.s < p_end AND x.e > p_start
  ORDER BY x.s
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_court_conflict(smallint, timestamp, timestamp, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_court_conflict(smallint, timestamp, timestamp, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.open_court_session(
  p_court smallint, p_reservation_id uuid, p_players jsonb,
  p_titular_name text, p_titular_lot text, p_titular_socio_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_now timestamp := now() AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_busy text;
BEGIN
  IF btrim(coalesce(p_titular_name,'')) = '' THEN
    RAISE EXCEPTION 'titular_required';
  END IF;
  IF jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid_players';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('court_agenda'), p_court);
  IF EXISTS (SELECT 1 FROM public.court_sessions WHERE court = p_court AND status = 'abierta' AND NOT is_late_entry) THEN
    RAISE EXCEPTION 'court_already_open';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    PERFORM 1 FROM public.court_reservations
    WHERE id = p_reservation_id AND status = 'reservada' AND event_type = 'reserva' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reservation_not_available';
    END IF;
  END IF;

  SELECT to_char(r.reservation_date + r.start_time, 'HH24:MI') || '-' || to_char(r.reservation_date + r.end_time, 'HH24:MI')
  INTO v_busy
  FROM public.court_reservations r
  WHERE r.court = p_court AND r.status = 'reservada' AND r.id IS DISTINCT FROM p_reservation_id
    AND (r.reservation_date + r.start_time) <= v_now AND (r.reservation_date + r.end_time) > v_now
  LIMIT 1;
  IF v_busy IS NOT NULL THEN
    RAISE EXCEPTION 'court_busy:%', v_busy;
  END IF;

  INSERT INTO public.court_sessions(court, reservation_id, players, titular_name, titular_lot, titular_socio_id, opened_by)
  VALUES (p_court, p_reservation_id, p_players, btrim(p_titular_name), btrim(coalesce(p_titular_lot,'')), p_titular_socio_id, coalesce(p_user,''))
  RETURNING id INTO v_id;

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.court_reservations
    SET status = 'abierta', session_id = v_id, updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  PERFORM public.sync_court_guest_charge(v_id);

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'court_already_open';
END;
$$;

CREATE OR REPLACE FUNCTION public.open_played_court_session(
  p_court smallint, p_date date, p_start time, p_end time, p_reservation_id uuid, p_players jsonb,
  p_titular_name text, p_titular_lot text, p_titular_socio_id uuid, p_user text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_start timestamp := p_date + p_start;
  v_end timestamp := p_date + p_end;
  v_conflict text;
BEGIN
  IF p_court IS NULL OR p_court NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'invalid_courts';
  END IF;
  IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'invalid_time';
  END IF;
  IF v_end > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 minute' THEN
    RAISE EXCEPTION 'played_in_future';
  END IF;
  IF btrim(coalesce(p_titular_name,'')) = '' THEN
    RAISE EXCEPTION 'titular_required';
  END IF;
  IF jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid_players';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('court_agenda'), p_court);

  IF p_reservation_id IS NOT NULL THEN
    PERFORM 1 FROM public.court_reservations
    WHERE id = p_reservation_id AND status = 'reservada' AND event_type = 'reserva'
      AND court = p_court AND reservation_date = p_date FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reservation_not_available';
    END IF;
  END IF;

  v_conflict := public.find_court_conflict(p_court, v_start, v_end, p_reservation_id);
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'court_busy:%', v_conflict;
  END IF;

  INSERT INTO public.court_sessions(
    court, reservation_id, players, titular_name, titular_lot, titular_socio_id, opened_by,
    opened_at, planned_end, is_late_entry)
  VALUES (
    p_court, p_reservation_id, p_players, btrim(p_titular_name), btrim(coalesce(p_titular_lot,'')),
    p_titular_socio_id, coalesce(p_user,''),
    v_start AT TIME ZONE 'America/Argentina/Buenos_Aires', v_end AT TIME ZONE 'America/Argentina/Buenos_Aires', true)
  RETURNING id INTO v_id;

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.court_reservations
    SET status = 'abierta', session_id = v_id, start_time = p_start, end_time = p_end, updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  PERFORM public.sync_court_guest_charge(v_id);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_played_court_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res uuid;
BEGIN
  UPDATE public.court_sessions SET status = 'cancelada', closed_at = planned_end
  WHERE id = p_session_id AND status = 'abierta' AND is_late_entry
  RETURNING reservation_id INTO v_res;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_open';
  END IF;

  DELETE FROM public.court_session_items WHERE session_id = p_session_id;

  IF v_res IS NOT NULL THEN
    UPDATE public.court_reservations SET status = 'reservada', session_id = NULL, updated_at = now() WHERE id = v_res;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_court_session_free(p_session_id uuid, p_user text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res uuid;
BEGIN
  IF (SELECT coalesce(sum(price * quantity), 0) FROM public.court_session_items WHERE session_id = p_session_id) > 0 THEN
    RAISE EXCEPTION 'session_has_items';
  END IF;

  UPDATE public.court_sessions
  SET status = 'cerrada', closed_at = CASE WHEN is_late_entry THEN planned_end ELSE now() END,
      total = 0, closed_by = coalesce(p_user,'')
  WHERE id = p_session_id AND status = 'abierta'
  RETURNING reservation_id INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_open';
  END IF;

  IF v_res IS NOT NULL THEN
    UPDATE public.court_reservations SET status = 'cerrada', updated_at = now() WHERE id = v_res;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_court_session_on_sale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res uuid;
BEGIN
  IF NEW.court_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.court_sessions
  SET status = 'cerrada', closed_at = CASE WHEN is_late_entry THEN planned_end ELSE now() END,
      total = NEW.total, payment_method = NEW.payment_method, sale_id = NEW.id,
      closed_by = coalesce(NEW.user_name,'')
  WHERE id = NEW.court_session_id AND status = 'abierta'
  RETURNING reservation_id INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'court_session_not_open';
  END IF;

  IF v_res IS NOT NULL THEN
    UPDATE public.court_reservations SET status = 'cerrada', updated_at = now() WHERE id = v_res;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.close_court_session_on_sale() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_court_session_on_sale() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.close_court_session_free(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_court_session_free(uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.open_played_court_session(smallint, date, time, time, uuid, jsonb, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_played_court_session(smallint, date, time, time, uuid, jsonb, text, text, uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.discard_played_court_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discard_played_court_session(uuid) TO anon, authenticated;
