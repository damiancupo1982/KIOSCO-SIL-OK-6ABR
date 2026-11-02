import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { CourtReservation, CourtReservationHistory, CourtSession } from '../../lib/supabase';
import BookingPeriodPicker from './BookingPeriodPicker';
import {
  DateRange,
  downloadCsv,
  fetchBookingRows,
  fetchOpenings,
  fetchScheduleChanges,
  formatCreated,
  formatScheduledAt,
  NO_EMPLOYEE_LABEL,
  PeriodKey,
  resolveRange,
} from './bookingControl';
import { COURTS, courtLabel, eventSummary, formatClock, formatDateTime, formatTime, localDateOf, todayISO } from './reservasUtils';

interface BookingHistoryProps {
  refreshKey: number;
}

const selectClass =
  'px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500';

const employeeOf = (name: string) => name.trim() || NO_EMPLOYEE_LABEL;

const statusLabel = (r: CourtReservation) => {
  if (r.status === 'cancelada') return 'CANCELADA';
  return r.booking_status === 'fuera_de_tiempo' ? 'FUERA DE TIEMPO' : 'A TIEMPO';
};

export default function BookingHistory({ refreshKey }: BookingHistoryProps) {
  const [period, setPeriod] = useState<PeriodKey>('mes');
  const [custom, setCustom] = useState<DateRange>({ from: todayISO(), to: todayISO() });
  const [employee, setEmployee] = useState('');
  const [day, setDay] = useState('');
  const [court, setCourt] = useState('');
  const [rows, setRows] = useState<CourtReservation[]>([]);
  const [openings, setOpenings] = useState<Map<string, CourtSession>>(new Map());
  const [changes, setChanges] = useState<Map<string, CourtReservationHistory[]>>(new Map());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = resolveRange(period, custom);
  const invalidRange = from > to;

  useEffect(() => {
    if (invalidRange) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const reservationRows = await fetchBookingRows({ from, to });
        const ids = reservationRows.map((r) => r.id);
        const [sessions, history] = await Promise.all([fetchOpenings(ids), fetchScheduleChanges(ids)]);
        if (cancelled) return;
        setRows(reservationRows);
        setOpenings(new Map(sessions.filter((s) => s.reservation_id).map((s) => [s.reservation_id as string, s])));
        const byReservation = new Map<string, CourtReservationHistory[]>();
        for (const h of history) byReservation.set(h.reservation_id, [...(byReservation.get(h.reservation_id) ?? []), h]);
        setChanges(byReservation);
        setError('');
      } catch {
        if (!cancelled) setError('No se pudo cargar el historial de cargas. Intente nuevamente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, invalidRange, refreshKey]);

  const employees = useMemo(() => [...new Set(rows.map((r) => employeeOf(r.created_by)))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!employee || employeeOf(r.created_by) === employee) &&
          (!day || localDateOf(r.created_at) === day) &&
          (!court || String(r.court) === court)
      ),
    [rows, employee, day, court]
  );

  const exportCsv = () => {
    downloadCsv(
      `cargas-reservas-${from}-${to}.csv`,
      ['Fecha de carga', 'Cancha', 'Tipo', 'Evento', 'Horario previsto al cargar', 'Horario actual', 'Estado', 'Demora (min)', 'Cargada por', 'Apertura de cancha', 'Usuario de apertura', 'Cambios de horario'],
      filtered.map((r) => {
        const opened = openings.get(r.id);
        return [
          formatCreated(r.created_at),
          courtLabel(r.court),
          r.event_type,
          eventSummary(r),
          formatScheduledAt(r.booking_scheduled_at, r.reservation_date, r.start_time),
          `${r.reservation_date} ${formatTime(r.start_time)}-${formatTime(r.end_time)}`,
          statusLabel(r),
          r.booking_delay_minutes ?? 0,
          employeeOf(r.created_by),
          opened ? `${formatDateTime(opened.opened_at)} ${formatClock(opened.opened_at)}` : 'Sin apertura',
          opened ? employeeOf(opened.opened_by) : '',
          changes.get(r.id)?.length ?? 0,
        ];
      })
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <BookingPeriodPicker period={period} custom={custom} onPeriodChange={setPeriod} onCustomChange={setCustom} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">Empleado</label>
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {employees.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">Día de carga</label>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">Cancha</label>
            <select value={court} onChange={(e) => setCourt(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {COURTS.map((c) => (
                <option key={c} value={c}>
                  {courtLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold transition-colors"
          >
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      </div>

      {invalidRange && (
        <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          La fecha "desde" debe ser anterior o igual a la fecha "hasta".
        </p>
      )}
      {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No hay cargas que coincidan con los filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Carga</th>
                  <th className="px-4 py-3 text-left font-bold">Cancha</th>
                  <th className="px-4 py-3 text-left font-bold">Evento</th>
                  <th className="px-4 py-3 text-left font-bold">Previsto</th>
                  <th className="px-4 py-3 text-left font-bold">Estado</th>
                  <th className="px-4 py-3 text-left font-bold">Cargó</th>
                  <th className="px-4 py-3 text-left font-bold">Apertura</th>
                  <th className="px-4 py-3 text-right font-bold">Cambios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const opened = openings.get(r.id);
                  const changeList = changes.get(r.id) ?? [];
                  const isLate = r.booking_status === 'fuera_de_tiempo' && r.status !== 'cancelada';
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`hover:bg-slate-50 transition-colors ${r.status === 'cancelada' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatCreated(r.created_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{courtLabel(r.court)}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800">{eventSummary(r) || r.event_type}</span>
                          <span className="block text-xs text-slate-500 uppercase">{r.event_type}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {formatScheduledAt(r.booking_scheduled_at, r.reservation_date, r.start_time)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tracking-wide whitespace-nowrap ${
                              statusLabel(r) === 'FUERA DE TIEMPO'
                                ? 'bg-orange-600 text-white'
                                : statusLabel(r) === 'CANCELADA'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {statusLabel(r)}
                          </span>
                          {isLate && <span className="block text-xs text-orange-700 font-semibold mt-1">{r.booking_delay_minutes} min de demora</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{employeeOf(r.created_by)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {opened ? (
                            <>
                              <span className="tabular-nums">{formatDateTime(opened.opened_at)} {formatClock(opened.opened_at)}</span>
                              <span className="block text-xs text-slate-500">{employeeOf(opened.opened_by)}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">Sin apertura</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {changeList.length > 0 ? (
                            <button
                              onClick={() => setExpanded(isOpen ? null : r.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-sky-700 hover:bg-sky-50 transition-colors"
                            >
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {changeList.length}
                            </button>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && changeList.length > 0 && (
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="px-6 py-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Cambios de horario</p>
                            <ul className="space-y-1.5 text-xs text-slate-700">
                              {changeList.map((h) => (
                                <li key={h.id}>
                                  <span className="font-semibold">{formatDateTime(h.changed_at)} {formatClock(h.changed_at)}</span>
                                  {' · '}
                                  {employeeOf(h.changed_by)}
                                  {': '}
                                  {h.previous_date} {formatTime(h.previous_start)}-{formatTime(h.previous_end)}
                                  {' → '}
                                  {h.new_date} {formatTime(h.new_start)}-{formatTime(h.new_end)}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
