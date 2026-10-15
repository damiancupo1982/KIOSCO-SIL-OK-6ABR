/*
# Corrección del control de superposición con turnos sin reserva

1. Cambios
- `find_court_conflict`: cuando no se excluye ninguna reserva (carga posterior sin reserva vinculada),
  ahora también considera los turnos que no tienen reserva de origen. Antes se omitían en ese caso.

2. Seguridad
- Sin cambios: la función sigue sin poder ejecutarse directamente desde la app.
*/

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
      AND (p_exclude_id IS NULL OR cs.reservation_id IS DISTINCT FROM p_exclude_id)
  ) x
  WHERE x.s < p_end AND x.e > p_start
  ORDER BY x.s
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_court_conflict(smallint, timestamp, timestamp, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_court_conflict(smallint, timestamp, timestamp, uuid) FROM anon, authenticated;
