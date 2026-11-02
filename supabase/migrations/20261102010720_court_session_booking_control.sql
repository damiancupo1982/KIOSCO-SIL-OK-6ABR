/*
# Control de carga fuera de tiempo para turnos jugados

Plain-English summary:
Played court turns loaded after they were played ("Cargar turno jugado") are now classified by the database
the same way as reservations: they are always "fuera de tiempo" because they are loaded after the scheduled start,
and the delay in minutes is calculated from the scheduled start to the moment of loading.
Turns linked to an existing reservation are not classified here, because that reservation already carries its own classification.
Live openings (not loaded late) are left unclassified and do not appear in the statistics.

1. Modified table: court_sessions (new additive columns)
- booking_scheduled_at (timestamptz): scheduled start of the played turn.
- booking_status (text): 'a_tiempo' or 'fuera_de_tiempo'. NULL when not classified.
- booking_delay_minutes (integer): minutes between the scheduled start and the moment of loading.

2. Triggers
- BEFORE INSERT on court_sessions: classifies late-loaded turns without a linked reservation.
- BEFORE UPDATE on court_sessions: restores created_at and the classification columns so no client can change them.

3. Security
- Trigger functions are not callable through the API (execute revoked).
- No grants or policies change.

4. Notes
- Existing sessions keep NULL classification; their original load time is not known.
*/

ALTER TABLE public.court_sessions
  ADD COLUMN IF NOT EXISTS booking_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_status text,
  ADD COLUMN IF NOT EXISTS booking_delay_minutes integer;

ALTER TABLE public.court_sessions DROP CONSTRAINT IF EXISTS court_sessions_booking_status_check;
ALTER TABLE public.court_sessions
  ADD CONSTRAINT court_sessions_booking_status_check
  CHECK (booking_status IS NULL OR booking_status IN ('a_tiempo', 'fuera_de_tiempo'));

CREATE OR REPLACE FUNCTION public.court_session_classify_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.is_late_entry AND NEW.reservation_id IS NULL THEN
    NEW.booking_scheduled_at := NEW.opened_at;
    IF now() > NEW.opened_at THEN
      NEW.booking_status := 'fuera_de_tiempo';
      NEW.booking_delay_minutes := ceil(extract(epoch FROM (now() - NEW.opened_at)) / 60)::integer;
    ELSE
      NEW.booking_status := 'a_tiempo';
      NEW.booking_delay_minutes := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.court_session_classify_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS court_sessions_classify_booking ON public.court_sessions;
CREATE TRIGGER court_sessions_classify_booking
  BEFORE INSERT ON public.court_sessions
  FOR EACH ROW EXECUTE FUNCTION public.court_session_classify_booking();

CREATE OR REPLACE FUNCTION public.court_session_protect_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.booking_scheduled_at := OLD.booking_scheduled_at;
  NEW.booking_status := OLD.booking_status;
  NEW.booking_delay_minutes := OLD.booking_delay_minutes;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.court_session_protect_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS court_sessions_protect_booking ON public.court_sessions;
CREATE TRIGGER court_sessions_protect_booking
  BEFORE UPDATE ON public.court_sessions
  FOR EACH ROW EXECUTE FUNCTION public.court_session_protect_booking();
