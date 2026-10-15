import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { supabase, CourtReservation } from '../../lib/supabase';
import {
  COURTS,
  TIME_SLOTS,
  addDaysISO,
  courtLabel,
  formatDateLong,
  formatDateShort,
  formatTime,
  startOfWeekISO,
  todayISO,
} from './reservasUtils';

type Mode = 'dia' | 'semana' | 'cancha';

interface ReservationsCalendarProps {
  refreshKey: number;
  onEdit: (reservation: CourtReservation) => void;
  onCreate: (court: number, date: string, time: string) => void;
}

const statusStyle: Record<CourtReservation['status'], string> = {
  reservada: 'bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200',
  abierta: 'bg-amber-100 border-amber-300 text-amber-900',
  cerrada: 'bg-slate-100 border-slate-300 text-slate-600',
  cancelada: 'bg-red-50 border-red-200 text-red-400 line-through',
};

export default function ReservationsCalendar({ refreshKey, onEdit, onCreate }: ReservationsCalendarProps) {
  const [mode, setMode] = useState<Mode>('dia');
  const [anchor, setAnchor] = useState(todayISO());
  const [court, setCourt] = useState(0);
  const [reservations, setReservations] = useState<CourtReservation[]>([]);
  const [error, setError] = useState('');

  const rangeStart = mode === 'dia' ? anchor : startOfWeekISO(anchor);
  const rangeEnd = mode === 'dia' ? anchor : addDaysISO(rangeStart, 6);
  const days = mode === 'dia' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDaysISO(rangeStart, i));

  useEffect(() => {
    (async () => {
      const { data, error: dbError } = await supabase
        .from('court_reservations')
        .select('*')
        .gte('reservation_date', rangeStart)
        .lte('reservation_date', rangeEnd)
        .neq('status', 'cancelada')
        .order('start_time');
      if (dbError) {
        setError('No se pudieron cargar las reservas.');
        return;
      }
      setError('');
      setReservations((data as CourtReservation[]) || []);
    })();
  }, [rangeStart, rangeEnd, refreshKey]);

  const find = (c: number, date: string, slot: string) =>
    reservations.find((r) => r.court === c && r.reservation_date === date && formatTime(r.start_time) === slot);

  const extraTimes = reservations.map((r) => formatTime(r.start_time)).filter((t) => !TIME_SLOTS.includes(t));
  const slots = Array.from(new Set([...TIME_SLOTS, ...extraTimes])).sort();

  const step = mode === 'dia' ? 1 : 7;

  const renderCell = (c: number, date: string, slot: string) => {
    const r = find(c, date, slot);
    if (r) {
      return (
        <button
          onClick={() => onEdit(r)}
          className={`w-full h-full min-h-[40px] text-left px-2 py-1 rounded-lg border text-xs transition-colors ${statusStyle[r.status]}`}
        >
          <p className="font-bold truncate">{r.titular_name}</p>
          <p className="opacity-75">
            Lote {r.titular_lot || '-'}
            {mode === 'semana' && ` · C${r.court}`}
          </p>
        </button>
      );
    }
    return (
      <button
        onClick={() => onCreate(c, date, slot)}
        className="group w-full h-full min-h-[40px] rounded-lg border border-dashed border-transparent hover:border-sky-300 hover:bg-sky-50 flex items-center justify-center"
      >
        <Plus size={14} className="text-sky-500 opacity-0 group-hover:opacity-100" />
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {(['dia', 'semana', 'cancha'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {m === 'dia' ? 'Día' : m === 'semana' ? 'Semana' : 'Por cancha'}
            </button>
          ))}
        </div>

        {mode === 'cancha' && (
          <div className="flex gap-1">
            {COURTS.map((c) => (
              <button
                key={c}
                onClick={() => setCourt(c)}
                className={`w-10 h-10 rounded-lg font-bold text-sm ${
                  court === c ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(addDaysISO(anchor, -step))} className="p-2 rounded-lg hover:bg-slate-100">
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button onClick={() => setAnchor(addDaysISO(anchor, step))} className="p-2 rounded-lg hover:bg-slate-100">
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setAnchor(todayISO())}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-sky-700 hover:bg-sky-50"
          >
            Hoy
          </button>
        </div>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}

      <p className="px-4 pt-3 text-sm font-semibold text-slate-600 capitalize">
        {mode === 'dia'
          ? formatDateLong(anchor)
          : `Semana del ${formatDateShort(rangeStart)} al ${formatDateShort(rangeEnd)}${mode === 'cancha' ? ` · ${courtLabel(court)}` : ''}`}
      </p>

      {mode === 'semana' ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map((d) => {
            const dayRes = reservations.filter((r) => r.reservation_date === d);
            return (
              <div key={d} className={`rounded-xl border p-2 min-h-[120px] ${d === todayISO() ? 'border-sky-300 bg-sky-50/40' : 'border-slate-200'}`}>
                <p className="text-xs font-bold uppercase text-slate-500 mb-2 capitalize">{formatDateShort(d)}</p>
                <div className="space-y-1.5">
                  {dayRes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onEdit(r)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs ${statusStyle[r.status]}`}
                    >
                      <p className="font-bold">
                        {formatTime(r.start_time)} · C{r.court}
                      </p>
                      <p className="truncate">{r.titular_name}</p>
                    </button>
                  ))}
                  {dayRes.length === 0 && <p className="text-xs text-slate-300">Sin reservas</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 min-w-[560px]">
            <thead>
              <tr>
                <th className="w-16" />
                {mode === 'dia'
                  ? COURTS.map((c) => (
                      <th key={c} className="text-sm font-bold text-slate-700 py-2">
                        {courtLabel(c)}
                      </th>
                    ))
                  : days.map((d) => (
                      <th key={d} className={`text-xs font-bold py-2 capitalize ${d === todayISO() ? 'text-sky-700' : 'text-slate-600'}`}>
                        {formatDateShort(d)}
                      </th>
                    ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot}>
                  <td className="text-xs font-semibold text-slate-500 text-right pr-2 align-top pt-2">{slot}</td>
                  {mode === 'dia'
                    ? COURTS.map((c) => (
                        <td key={c} className="bg-slate-50 rounded-lg p-0.5 align-top">
                          {renderCell(c, anchor, slot)}
                        </td>
                      ))
                    : days.map((d) => (
                        <td key={d} className="bg-slate-50 rounded-lg p-0.5 align-top">
                          {renderCell(court, d, slot)}
                        </td>
                      ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
