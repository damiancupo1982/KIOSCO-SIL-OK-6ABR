import { useState } from 'react';
import { CalendarPlus, Loader2, PlayCircle, Save, X, XCircle } from 'lucide-react';
import { supabase, CourtPlayer, CourtReservation } from '../../lib/supabase';
import LotPersonInput from './LotPersonInput';
import { COURTS, TIME_SLOTS, courtLabel, formatTime, todayISO } from './reservasUtils';

interface ReservationModalProps {
  reservation?: CourtReservation;
  defaultCourt?: number;
  defaultDate?: string;
  defaultTime?: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenCourt?: (reservation: CourtReservation) => void;
}

export default function ReservationModal({
  reservation,
  defaultCourt = 0,
  defaultDate,
  defaultTime,
  userName,
  onClose,
  onSaved,
  onOpenCourt,
}: ReservationModalProps) {
  const isEdit = !!reservation;
  const [court, setCourt] = useState(reservation?.court ?? defaultCourt);
  const [date, setDate] = useState(reservation?.reservation_date ?? defaultDate ?? todayISO());
  const [time, setTime] = useState(reservation ? formatTime(reservation.start_time) : defaultTime ?? '18:00');
  const [titular, setTitular] = useState<CourtPlayer>({
    lot: reservation?.titular_lot ?? '',
    name: reservation?.titular_name ?? '',
    socio_id: null,
    is_socio: false,
  });
  const [notes, setNotes] = useState(reservation?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const slots = TIME_SLOTS.includes(time) ? TIME_SLOTS : [...TIME_SLOTS, time].sort();

  const handleSave = async () => {
    setError('');
    if (!titular.name.trim()) return setError('Ingrese el nombre del titular.');
    if (!date || !time) return setError('Complete fecha y hora.');
    setSaving(true);
    const payload = {
      court,
      reservation_date: date,
      start_time: time,
      titular_lot: titular.lot.trim(),
      titular_name: titular.name.trim(),
      notes: notes.trim(),
    };
    const { error: dbError } = isEdit
      ? await supabase
          .from('court_reservations')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', reservation!.id)
      : await supabase.from('court_reservations').insert([{ ...payload, created_by: userName }]);
    setSaving(false);
    if (dbError) {
      setError(
        dbError.code === '23505'
          ? `Ya existe una reserva en ${courtLabel(court)} el ${date} a las ${time}.`
          : `No se pudo guardar la reserva: ${dbError.message}`
      );
      return;
    }
    onSaved();
  };

  const handleCancelReservation = async () => {
    if (!reservation || !window.confirm('¿Cancelar esta reserva?')) return;
    setSaving(true);
    const { error: dbError } = await supabase
      .from('court_reservations')
      .update({ status: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', reservation.id);
    setSaving(false);
    if (dbError) return setError(`No se pudo cancelar: ${dbError.message}`);
    onSaved();
  };

  const editable = !isEdit || reservation!.status === 'reservada';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
              <CalendarPlus size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">{isEdit ? 'Reserva' : 'Agendar reserva'}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Cancha</label>
            <div className="grid grid-cols-4 gap-2">
              {COURTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!editable}
                  onClick={() => setCourt(c)}
                  className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                    court === c
                      ? 'bg-sky-600 border-sky-600 text-white shadow'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Fecha</label>
              <input
                type="date"
                value={date}
                disabled={!editable}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Hora</label>
              <select
                value={time}
                disabled={!editable}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-sky-500"
              >
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <LotPersonInput label="Titular" value={titular} onChange={setTitular} highlight />

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Observación (opcional)</label>
            <textarea
              value={notes}
              disabled={!editable}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 space-y-2">
          {isEdit && editable && onOpenCourt && (
            <button
              onClick={() => onOpenCourt(reservation!)}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg transition-colors"
            >
              <PlayCircle size={20} /> ABRIR CANCHA
            </button>
          )}
          {editable && (
            <div className="flex gap-2">
              {isEdit && (
                <button
                  onClick={handleCancelReservation}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-semibold transition-colors"
                >
                  <XCircle size={18} /> Cancelar reserva
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-semibold transition-colors"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isEdit ? 'Guardar cambios' : 'Agendar'}
              </button>
            </div>
          )}
          {!editable && (
            <p className="text-center text-sm text-slate-500">Esta reserva está {reservation!.status} y no puede modificarse.</p>
          )}
        </div>
      </div>
    </div>
  );
}
