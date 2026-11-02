import { useEffect, useMemo, useState } from 'react';
import { CourtReservation, CourtSession } from '../../lib/supabase';
import BookingPeriodPicker from './BookingPeriodPicker';
import {
  DateRange,
  fetchBookingRows,
  fetchOpeningsInRange,
  NO_EMPLOYEE_LABEL,
  PeriodKey,
  resolveRange,
  summarizeBookings,
} from './bookingControl';
import { todayISO } from './reservasUtils';

interface BookingControlPanelProps {
  refreshKey: number;
}

export default function BookingControlPanel({ refreshKey }: BookingControlPanelProps) {
  const [period, setPeriod] = useState<PeriodKey>('mes');
  const [custom, setCustom] = useState<DateRange>({ from: todayISO(), to: todayISO() });
  const [rows, setRows] = useState<CourtReservation[]>([]);
  const [openings, setOpenings] = useState<CourtSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = resolveRange(period, custom);
  const invalidRange = from > to;

  useEffect(() => {
    if (invalidRange) {
      setRows([]);
      setOpenings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchBookingRows({ from, to }), fetchOpeningsInRange({ from, to })])
      .then(([reservationRows, openingRows]) => {
        if (cancelled) return;
        setRows(reservationRows);
        setOpenings(openingRows);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el control de carga. Intente nuevamente.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, invalidRange, refreshKey]);

  const summary = useMemo(() => summarizeBookings(rows), [rows]);

  const employeeTable = useMemo(() => {
    const openingCounts = new Map<string, number>();
    for (const o of openings) {
      const name = o.opened_by.trim() || NO_EMPLOYEE_LABEL;
      openingCounts.set(name, (openingCounts.get(name) ?? 0) + 1);
    }
    const names = new Set([...summary.employees.map((e) => e.name), ...openingCounts.keys()]);
    return [...names]
      .map((name) => {
        const stat = summary.employees.find((e) => e.name === name);
        return {
          name,
          total: stat?.total ?? 0,
          late: stat?.late ?? 0,
          latePct: stat?.latePct ?? 0,
          avgDelay: stat?.avgDelay ?? 0,
          openings: openingCounts.get(name) ?? 0,
        };
      })
      .sort((a, b) => b.total - a.total || b.openings - a.openings);
  }, [summary, openings]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <BookingPeriodPicker
          period={period}
          custom={custom}
          onPeriodChange={setPeriod}
          onCustomChange={setCustom}
        />
      </div>

      {invalidRange && (
        <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          La fecha "desde" debe ser anterior o igual a la fecha "hasta".
        </p>
      )}
      {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reservas cargadas</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{loading ? '…' : summary.total}</p>
          <p className="mt-1 text-xs text-slate-500">100% del período</p>
        </div>
        <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">A tiempo</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">{loading ? '…' : summary.onTime}</p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">{summary.onTimePct}% de las cargas</p>
        </div>
        <div className="bg-white border border-orange-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Fuera de tiempo</p>
          <p className="mt-2 text-3xl font-black text-orange-700">{loading ? '…' : summary.late}</p>
          <p className="mt-1 text-xs font-semibold text-orange-700">{summary.latePct}% de las cargas</p>
        </div>
      </div>

      {summary.total > 0 && (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${summary.onTimePct}% a tiempo, ${summary.latePct}% fuera de tiempo`}>
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${summary.onTimePct}%` }} />
          <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${summary.latePct}%` }} />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Control por empleado</h3>
          <p className="text-xs text-slate-500 mt-1">
            Las reservas canceladas no se cuentan. Las aperturas de cancha se registran aparte, con hora y usuario.
          </p>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Cargando…</p>
        ) : employeeTable.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No hay cargas ni aperturas en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">Empleado</th>
                  <th className="text-right px-4 py-3 font-bold">Cargas</th>
                  <th className="text-right px-4 py-3 font-bold">Fuera de tiempo</th>
                  <th className="text-right px-4 py-3 font-bold">% fuera</th>
                  <th className="text-right px-4 py-3 font-bold">Demora promedio</th>
                  <th className="text-right px-5 py-3 font-bold">Aperturas de cancha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeTable.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-700 font-semibold">{row.late}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.latePct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.late ? `${row.avgDelay} min` : '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.openings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
