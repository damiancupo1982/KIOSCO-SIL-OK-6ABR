import { useEffect, useState } from 'react';
import { CalendarCheck, Link2, Loader2, X } from 'lucide-react';
import { supabase, CourtPlayer, CourtReservation } from '../../lib/supabase';
import LotPersonInput from './LotPersonInput';
import { addDaysISO, COURTS, formatTime, hhmmOf, minutesOf, rpcErrorMessage, todayISO } from './reservasUtils';

interface PlayedTurnoModalProps {
  userName: string;
  onClose: () => void;
  onDone: (sessionId: string) => void;
}

const emptyPlayer = (): CourtPlayer => ({ lot: '', name: '', socio_id: null, is_socio: false });

const inputClass =
  'w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-stone-500 focus:border-stone-500';
const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2';

export default function PlayedTurnoModal({ userName, onClose, onDone }: PlayedTurnoModalProps) {
  const [court, setCourt] = useState(0);
  const [date, setDate] = useState(addDaysISO(todayISO(), -1));
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('19:30');
  const [pending, setPending] = useState<CourtReservation[]>([]);
  const [linked, setLinked] = useState<CourtReservation | null>(null);
  const [players, setPlayers] = useState<CourtPlayer[]>([emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLinked(null);
    if (!date) return setPending([]);
    let active = true;
    supabase
      .from('court_reservations')
      .select('*')
      .eq('court', court)
      .eq('reservation_date', date)
      .eq('status', 'reservada')
      .eq('event_type', 'reserva')
      .order('start_time')
      .then(({ data }) => {
        if (active) setPending((data as CourtReservation[]) || []);
      });
    return () => {
      active = false;
    };
  }, [court, date]);

  const changeStart = (value: string) => {
    if (value && end && minutesOf(end) > minutesOf(start)) {
      setEnd(hhmmOf(minutesOf(value) + minutesOf(end) - minutesOf(start)));
    }
    setStart(value);
  };

  const toggleLink = (r: CourtReservation) => {
    if (linked?.id === r.id) return setLinked(null);
    setLinked(r);
    setStart(formatTime(r.start_time));
    setEnd(formatTime(r.end_time));
    if (!players[0].name.trim()) {
      setPlayers((prev) => [{ lot: r.titular_lot, name: r.titular_name, socio_id: null, is_socio: false }, ...prev.slice(1)]);
    }
  };

  const updatePlayer = (index: number, player: CourtPlayer) =>
    setPlayers((prev) => prev.map((p, i) => (i === index ? player : p)));

  const handleSave = async () => {
    setError('');
    if (!date || !start || !end) return setError('Complete fecha, hora de inicio y hora de fin.');
    if (minutesOf(end) <= minutesOf(start)) return setError('La hora de fin debe ser posterior a la hora de inicio.');
    if (date > todayISO()) return setError('La fecha no puede ser futura.');
    const titular = players[0];
    if (!titular.name.trim()) return setError('El Jugador 1 (titular) es obligatorio.');
    const incomplete = players.findIndex((p) => p.lot.trim() && !p.name.trim());
    if (incomplete >= 0) return setError(`Complete el nombre del Jugador ${incomplete + 1} o borre su lote.`);

    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc('open_played_court_session', {
      p_court: court,
      p_date: date,
      p_start: start,
      p_end: end,
      p_reservation_id: linked?.id ?? null,
      p_players: players
        .filter((p) => p.name.trim())
        .map((p) => ({ ...p, lot: p.lot.trim(), name: p.name.trim() })),
      p_titular_name: titular.name.trim(),
      p_titular_lot: titular.lot.trim(),
      p_titular_socio_id: titular.is_socio ? titular.socio_id : null,
      p_user: userName,
    });
    setSaving(false);
    if (rpcError || !data) return setError(rpcErrorMessage(rpcError?.message));
    onDone(data as string);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-stone-600 text-white">
              <CalendarCheck size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Reserva jugada</h3>
              <p className="text-xs text-slate-500">Cargar un turno que ya se jugó (por ejemplo, revisando las cámaras).</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className={labelClass}>Cancha</label>
            <div className="grid grid-cols-4 gap-2">
              {COURTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCourt(c)}
                  className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                    court === c ? 'bg-stone-600 text-white border-transparent shadow' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Inicio</label>
              <input type="time" step={300} value={start} onChange={(e) => changeStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fin</label>
              <input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </div>
          </div>

          {pending.length > 0 && (
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-sky-800">
                Hay reservas sin abrir en esta cancha y fecha. Si el turno corresponde a una, vincúlela:
              </p>
              <div className="flex flex-wrap gap-2">
                {pending.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleLink(r)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                      linked?.id === r.id ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-800 border-sky-200 hover:border-sky-400'
                    }`}
                  >
                    <Link2 size={12} />
                    {formatTime(r.start_time)}-{formatTime(r.end_time)} · {r.titular_lot ? `Lote ${r.titular_lot} - ` : ''}
                    {r.titular_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Jugadores (el Jugador 1 es el titular)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {players.map((p, i) => (
                <LotPersonInput
                  key={i}
                  label={i === 0 ? 'Jugador 1 - Titular' : `Jugador ${i + 1}`}
                  value={p}
                  onChange={(player) => updatePlayer(i, player)}
                  highlight={i === 0}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-stone-700 hover:bg-stone-800 disabled:bg-slate-300 text-white font-bold shadow-lg transition-colors"
          >
            {saving ? <Loader2 size={20} className="animate-spin" /> : <CalendarCheck size={20} />}
            CONTINUAR A CONSUMOS
          </button>
        </div>
      </div>
    </div>
  );
}
