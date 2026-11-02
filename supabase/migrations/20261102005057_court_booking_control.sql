/*
# Control de reservas cargadas fuera de horario

Plain-English summary:
Every new court reservation is now classified by the database at the moment it is saved:
"a tiempo" when it is created before its scheduled start, "fuera de tiempo" when it is created after it.
The classification, the real creation time and the delay in minutes can not be set or changed from the browser.
Schedule changes made to existing reservations are recorded in a history table with the user who made them.
Reservations created before this control existed are left unclassified, because their original schedule is not reliable.

1. Modified table: court_reservations (new columns, all additive)
- booking_scheduled_at (timestamptz): scheduled start, in Buenos Aires time, as it was when the reservation was first created.
- booking_status (text): 'a_tiempo' or 'fuera_de_tiempo'. NULL means the reservation predates this control or is a maintenance block.
- booking_delay_minutes (integer): minutes after the scheduled start when the reservation was created (0 when on time).

2. New table: court_reservation_history
- One row per schedule change (date, start time or end time) of an existing reservation.
- Stores previous and new values, the user who made the change (changed_by) and the moment of the change.

3. Triggers
- BEFORE INSERT on court_reservations: sets created_at to the server time and computes the classification. Maintenance blocks are never classified.
- BEFORE UPDATE on court_reservations: restores created_at, created_by and the classification columns, so no client can alter them.

4. Modified function: save_court_event
- Same signature and behavior. When an existing reservation's date or times change, a history row is written with the user who saved the change.

5. Security
- RLS enabled on court_reservation_history. Read access for anon and authenticated (single-tenant app without sign-in, same as the other court tables). No client insert, update or delete policy: rows are written only by save_court_event.
- Trigger functions are not callable through the API.

6. Notes
- Reused court rows in a group keep their original classification, which reflects when the booking was first made.
- Cancelled reservations keep their classification and are excluded from statistics by the application.
*/

ALTER TABLE public.court_reservations
  ADD COLUMN IF NOT EXISTS booking_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_status text,
  ADD COLUMN IF NOT EXISTS booking_delay_minutes integer;

ALTER TABLE public.court_reservations DROP CONSTRAINT IF EXISTS court_reservations_booking_status_check;
ALTER TABLE public.court_reservations
  ADD CONSTRAINT court_reservations_booking_status_check
  CHECK (booking_status IS NULL OR booking_status IN ('a_tiempo', 'fuera_de_tiempo'));

CREATE INDEX IF NOT EXISTS court_reservations_booking_created_idx
  ON public.court_reservations (created_at)
  WHERE booking_status IS NOT NULL;

CREATE OR REPLACE FUNCTION public.court_reservation_classify_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_scheduled timestamptz;
BEGIN
  NEW.created_at := now();

  IF NEW.event_type = 'mantenimiento' THEN
    NEW.booking_scheduled_at := NULL;
    NEW.booking_status := NULL;
    NEW.booking_delay_minutes := NULL;
    RETURN NEW;
  END IF;

  v_scheduled := (NEW.reservation_date + NEW.start_time) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  NEW.booking_scheduled_at := v_scheduled;

  IF now() > v_scheduled THEN
    NEW.booking_status := 'fuera_de_tiempo';
    NEW.booking_delay_minutes := ceil(extract(epoch FROM (now() - v_scheduled)) / 60)::integer;
  ELSE
    NEW.booking_status := 'a_tiempo';
    NEW.booking_delay_minutes := 0;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.court_reservation_classify_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS court_reservations_classify_booking ON public.court_reservations;
CREATE TRIGGER court_reservations_classify_booking
  BEFORE INSERT ON public.court_reservations
  FOR EACH ROW EXECUTE FUNCTION public.court_reservation_classify_booking();

CREATE OR REPLACE FUNCTION public.court_reservation_protect_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  NEW.booking_scheduled_at := OLD.booking_scheduled_at;
  NEW.booking_status := OLD.booking_status;
  NEW.booking_delay_minutes := OLD.booking_delay_minutes;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.court_reservation_protect_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS court_reservations_protect_booking ON public.court_reservations;
CREATE TRIGGER court_reservations_protect_booking
  BEFORE UPDATE ON public.court_reservations
  FOR EACH ROW EXECUTE FUNCTION public.court_reservation_protect_booking();

CREATE TABLE IF NOT EXISTS public.court_reservation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.court_reservations(id) ON DELETE CASCADE,
  event_group uuid NOT NULL,
  court smallint NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT '',
  previous_date date NOT NULL,
  previous_start time NOT NULL,
  previous_end time NOT NULL,
  new_date date NOT NULL,
  new_start time NOT NULL,
  new_end time NOT NULL
);

CREATE INDEX IF NOT EXISTS court_reservation_history_reservation_idx
  ON public.court_reservation_history (reservation_id, changed_at);
CREATE INDEX IF NOT EXISTS court_reservation_history_changed_idx
  ON public.court_reservation_history (changed_at);

ALTER TABLE public.court_reservation_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.court_reservation_history TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_court_reservation_history" ON public.court_reservation_history;
CREATE POLICY "anon_select_court_reservation_history" ON public.court_reservation_history
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.save_court_event(p_group_id uuid, p_event_type text, p_courts smallint[], p_date date, p_start time without time zone, p_end time without time zone, p_titular_name text, p_titular_lot text, p_title text, p_professor text, p_student text, p_notes text, p_user text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
v_group uuid := coalesce(p_group_id, gen_random_uuid());
v_courts smallint[];
v_free_rows uuid[];
v_new_courts smallint[];
v_row record;
v_court smallint;
i integer;
BEGIN
IF p_event_type NOT IN ('reserva','clase','torneo','mantenimiento') THEN
RAISE EXCEPTION 'invalid_event';
END IF;
SELECT array_agg(DISTINCT c ORDER BY c) INTO v_courts FROM unnest(p_courts) c WHERE c BETWEEN 0 AND 3;
IF v_courts IS NULL OR array_length(v_courts, 1) <> coalesce(array_length(p_courts, 1), 0) THEN
RAISE EXCEPTION 'invalid_courts';
END IF;
IF p_event_type IN ('reserva','clase') AND array_length(v_courts, 1) <> 1 THEN
RAISE EXCEPTION 'invalid_courts';
END IF;
IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
RAISE EXCEPTION 'invalid_time';
END IF;
IF p_event_type = 'reserva' AND btrim(coalesce(p_titular_name,'')) = '' THEN
RAISE EXCEPTION 'titular_required';
END IF;
IF p_event_type = 'torneo' AND btrim(coalesce(p_title,'')) = '' THEN
RAISE EXCEPTION 'title_required';
END IF;

IF p_group_id IS NOT NULL THEN
IF NOT EXISTS (SELECT 1 FROM public.court_reservations WHERE event_group = p_group_id AND status = 'reservada') THEN
RAISE EXCEPTION 'event_not_editable';
END IF;
IF EXISTS (SELECT 1 FROM public.court_reservations WHERE event_group = p_group_id AND status = 'abierta') THEN
RAISE EXCEPTION 'event_not_editable';
END IF;
END IF;

-- Rows whose court is no longer selected are reused for newly selected courts; leftovers are cancelled.
SELECT coalesce(array_agg(id), '{}') INTO v_free_rows FROM public.court_reservations
WHERE event_group = v_group AND status = 'reservada' AND NOT (court = ANY (v_courts));
SELECT coalesce(array_agg(c), '{}') INTO v_new_courts FROM unnest(v_courts) c
WHERE NOT EXISTS (SELECT 1 FROM public.court_reservations r WHERE r.event_group = v_group AND r.status = 'reservada' AND r.court = c);

FOR i IN 1 .. coalesce(array_length(v_free_rows, 1), 0) LOOP
IF i <= coalesce(array_length(v_new_courts, 1), 0) THEN
UPDATE public.court_reservations SET court = v_new_courts[i] WHERE id = v_free_rows[i];
ELSE
UPDATE public.court_reservations SET status = 'cancelada', updated_at = now() WHERE id = v_free_rows[i];
END IF;
END LOOP;

FOR v_row IN SELECT id FROM public.court_reservations WHERE event_group = v_group AND status = 'reservada' LOOP
INSERT INTO public.court_reservation_history(reservation_id, event_group, court, changed_by, previous_date, previous_start, previous_end, new_date, new_start, new_end)
SELECT r.id, r.event_group, r.court, coalesce(p_user,''), r.reservation_date, r.start_time, r.end_time, p_date, p_start, p_end
FROM public.court_reservations r
WHERE r.id = v_row.id AND (r.reservation_date, r.start_time, r.end_time) IS DISTINCT FROM (p_date, p_start, p_end);

UPDATE public.court_reservations SET
event_type = p_event_type, reservation_date = p_date, start_time = p_start, end_time = p_end,
titular_name = btrim(coalesce(p_titular_name,'')), titular_lot = btrim(coalesce(p_titular_lot,'')),
title = btrim(coalesce(p_title,'')), professor = btrim(coalesce(p_professor,'')),
student = btrim(coalesce(p_student,'')), notes = btrim(coalesce(p_notes,'')), updated_at = now()
WHERE id = v_row.id;
END LOOP;

FOR i IN coalesce(array_length(v_free_rows, 1), 0) + 1 .. coalesce(array_length(v_new_courts, 1), 0) LOOP
v_court := v_new_courts[i];
INSERT INTO public.court_reservations(
court, reservation_date, start_time, end_time, titular_lot, titular_name, notes, status,
created_by, event_type, event_group, title, professor, student)
VALUES (
v_court, p_date, p_start, p_end, btrim(coalesce(p_titular_lot,'')), btrim(coalesce(p_titular_name,'')),
btrim(coalesce(p_notes,'')), 'reservada', coalesce(p_user,''), p_event_type, v_group,
btrim(coalesce(p_title,'')), btrim(coalesce(p_professor,'')), btrim(coalesce(p_student,'')));
END LOOP;

RETURN v_group;
END;
$function$;
