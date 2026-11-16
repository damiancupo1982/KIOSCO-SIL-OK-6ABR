/*
# Control de carga con cuatro estados

Plain-English summary:
Every court reservation and loaded played turn is classified by the database at the moment it is saved into one of four states:
"anticipada" (created more than 10 minutes before the start), "a_tiempo" (created from 10 minutes before to 30 minutes after the start, both limits included),
"carga_tardia" (created more than 30 minutes after the start, same calendar day as the turn) and
"carga_fuera_de_fecha" (created on a calendar day after the turn's day; takes priority over the late state).
Existing classified rows are recalculated from their saved creation time, which is reliable because the database has always set it at insert.

1. Modified table: court_reservations and court_sessions
- booking_status now accepts 'anticipada', 'a_tiempo', 'carga_tardia' or 'carga_fuera_de_fecha' (the old 'fuera_de_tiempo' value is replaced).
- booking_delay_minutes is the minutes after the scheduled start, 0 for anticipada and a_tiempo.

2. New function: booking_timing(created, scheduled)
- Pure calculation of the state and delay using Buenos Aires calendar days. Used by the classification triggers and by the recalculation below.

3. Triggers
- The classification triggers on court_reservations and court_sessions use the new states.
- The protection triggers that stop clients from changing created_at and the classification are unchanged.

4. Recalculation
- Existing classified rows of both tables are recalculated from their saved created_at and booking_scheduled_at.
- Rows without classification (maintenance blocks, live openings) are not touched.

5. Security
- booking_timing is a pure calculation with no table access, so it has no grants to change.
- No policies or grants change.

6. Notes
- The protection triggers are disabled only while the recalculation runs and re-enabled in the same migration.
- Cancelled reservations keep their classification; the application excludes them from statistics.
*/

ALTER TABLE public.court_reservations DROP CONSTRAINT IF EXISTS court_reservations_booking_status_check;
ALTER TABLE public.court_sessions DROP CONSTRAINT IF EXISTS court_sessions_booking_status_check;

CREATE OR REPLACE FUNCTION public.booking_timing(p_created timestamptz, p_scheduled timestamptz)
RETURNS TABLE (status text, delay_minutes integer)
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_tz constant text := 'America/Argentina/Buenos_Aires';
BEGIN
  IF (p_created AT TIME ZONE v_tz)::date > (p_scheduled AT TIME ZONE v_tz)::date THEN
    status := 'carga_fuera_de_fecha';
    delay_minutes := greatest(0, ceil(extract(epoch FROM (p_created - p_scheduled)) / 60))::integer;
  ELSIF p_created < p_scheduled - interval '10 minutes' THEN
    status := 'anticipada';
    delay_minutes := 0;
  ELSIF p_created <= p_scheduled + interval '30 minutes' THEN
    status := 'a_tiempo';
    delay_minutes := 0;
  ELSE
    status := 'carga_tardia';
    delay_minutes := ceil(extract(epoch FROM (p_created - p_scheduled)) / 60)::integer;
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.court_reservation_classify_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_scheduled timestamptz;
  v_status text;
  v_delay integer;
BEGIN
  NEW.created_at := now();

  IF NEW.event_type = 'mantenimiento' THEN
    NEW.booking_scheduled_at := NULL;
    NEW.booking_status := NULL;
    NEW.booking_delay_minutes := NULL;
    RETURN NEW;
  END IF;

  v_scheduled := (NEW.reservation_date + NEW.start_time) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  SELECT t.status, t.delay_minutes INTO v_status, v_delay FROM public.booking_timing(now(), v_scheduled) t;
  NEW.booking_scheduled_at := v_scheduled;
  NEW.booking_status := v_status;
  NEW.booking_delay_minutes := v_delay;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.court_session_classify_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_status text;
  v_delay integer;
BEGIN
  IF NEW.is_late_entry AND NEW.reservation_id IS NULL THEN
    SELECT t.status, t.delay_minutes INTO v_status, v_delay FROM public.booking_timing(now(), NEW.opened_at) t;
    NEW.booking_scheduled_at := NEW.opened_at;
    NEW.booking_status := v_status;
    NEW.booking_delay_minutes := v_delay;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.court_reservations DISABLE TRIGGER court_reservations_protect_booking;
ALTER TABLE public.court_sessions DISABLE TRIGGER court_sessions_protect_booking;

UPDATE public.court_reservations r
SET booking_status = (SELECT t.status FROM public.booking_timing(r.created_at, r.booking_scheduled_at) t),
    booking_delay_minutes = (SELECT t.delay_minutes FROM public.booking_timing(r.created_at, r.booking_scheduled_at) t)
WHERE r.booking_status IS NOT NULL AND r.booking_scheduled_at IS NOT NULL;

UPDATE public.court_sessions s
SET booking_status = (SELECT t.status FROM public.booking_timing(s.created_at, s.booking_scheduled_at) t),
    booking_delay_minutes = (SELECT t.delay_minutes FROM public.booking_timing(s.created_at, s.booking_scheduled_at) t)
WHERE s.booking_status IS NOT NULL AND s.booking_scheduled_at IS NOT NULL;

ALTER TABLE public.court_reservations ENABLE TRIGGER court_reservations_protect_booking;
ALTER TABLE public.court_sessions ENABLE TRIGGER court_sessions_protect_booking;

ALTER TABLE public.court_reservations
  ADD CONSTRAINT court_reservations_booking_status_check
  CHECK (booking_status IS NULL OR booking_status IN ('anticipada', 'a_tiempo', 'carga_tardia', 'carga_fuera_de_fecha'));
ALTER TABLE public.court_sessions
  ADD CONSTRAINT court_sessions_booking_status_check
  CHECK (booking_status IS NULL OR booking_status IN ('anticipada', 'a_tiempo', 'carga_tardia', 'carga_fuera_de_fecha'));
