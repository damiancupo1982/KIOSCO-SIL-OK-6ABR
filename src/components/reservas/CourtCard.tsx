import { CalendarPlus, Clock, Eye, PlayCircle, User } from 'lucide-react';
import { CourtReservation, CourtSession } from '../../lib/supabase';
import { courtLabel, formatClock, formatDuration, formatTime, money } from './reservasUtils';

interface CourtCardProps {
  court: number;
  session?: CourtSession;
  sessionTotal: number;
  reservation?: CourtReservation;
  onSchedule: () => void;
  onOpen: () => void;
  onViewReservation: () => void;
  onViewTurno: () => void;
}

export default function CourtCard({
  court,
  session,
  sessionTotal,
  reservation,
  onSchedule,
  onOpen,
  onViewReservation,
  onViewTurno,
}: CourtCardProps) {
  const state = session ? 'abierta' : reservation ? 'reservada' : 'libre';

  const theme = {
    libre: {
      ring: 'border-emerald-200 hover:border-emerald-400',
      band: 'from-emerald-500 to-teal-500',
      badge: 'bg-emerald-100 text-emerald-800',
      label: 'LIBRE',
    },
    reservada: {
      ring: 'border-sky-200 hover:border-sky-400',
      band: 'from-sky-500 to-blue-600',
      badge: 'bg-sky-100 text-sky-800',
      label: 'RESERVADA',
    },
    abierta: {
      ring: 'border-amber-300 hover:border-amber-500',
      band: 'from-amber-500 to-orange-500',
      badge: 'bg-amber-100 text-amber-800',
      label: 'EN JUEGO',
    },
  }[state];

  return (
    <div className={`bg-white rounded-2xl border-2 ${theme.ring} shadow-lg hover:shadow-xl transition-all overflow-hidden flex flex-col`}>
      <div className={`bg-gradient-to-r ${theme.band} px-5 py-4 flex items-center justify-between text-white`}>
        <div>
          <p className="text-xs uppercase tracking-widest opacity-80">Cancha</p>
          <p className="text-4xl font-black leading-none">{court}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${theme.badge} flex items-center gap-1.5`}>
          {state === 'abierta' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          {theme.label}
        </span>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {state === 'abierta' && session && (
          <div className="space-y-3 flex-1">
            <div className="flex items-start gap-3">
              <User size={18} className="text-slate-400 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{session.titular_name}</p>
                <p className="text-sm text-slate-500">Lote {session.titular_lot || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[11px] text-slate-500 uppercase">Apertura</p>
                <p className="font-bold text-slate-800">{formatClock(session.opened_at)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="text-[11px] text-slate-500 uppercase">Tiempo</p>
                <p className="font-bold text-slate-800 flex items-center gap-1">
                  <Clock size={13} className="text-amber-500" />
                  {formatDuration(session.opened_at)}
                </p>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-800">Consumo</span>
              <span className="text-xl font-bold text-emerald-700">{money(sessionTotal)}</span>
            </div>
          </div>
        )}

        {state === 'reservada' && reservation && (
          <div className="space-y-3 flex-1">
            <div className="text-center py-2">
              <p className="text-5xl font-black text-sky-700 tracking-tight">{formatTime(reservation.start_time)}</p>
              <p className="text-xs text-slate-500 uppercase mt-1">Hoy</p>
            </div>
            <div className="bg-sky-50 rounded-xl p-3">
              <p className="font-bold text-slate-800 truncate">{reservation.titular_name}</p>
              <p className="text-sm text-slate-500">Lote {reservation.titular_lot || '-'}</p>
            </div>
          </div>
        )}

        {state === 'libre' && (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-slate-400 text-sm">{courtLabel(court)} disponible</p>
          </div>
        )}

        <div className="mt-4 grid gap-2 grid-cols-2">
          {state === 'libre' && (
            <>
              <button
                onClick={onSchedule}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-sky-200 text-sky-700 hover:bg-sky-50 font-bold text-sm transition-colors"
              >
                <CalendarPlus size={18} /> AGENDAR
              </button>
              <button
                onClick={onOpen}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow transition-colors"
              >
                <PlayCircle size={18} /> ABRIR
              </button>
            </>
          )}
          {state === 'reservada' && (
            <button
              onClick={onViewReservation}
              className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow transition-colors"
            >
              <Eye size={18} /> VER RESERVA
            </button>
          )}
          {state === 'abierta' && (
            <button
              onClick={onViewTurno}
              className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow transition-colors"
            >
              <Eye size={18} /> VER TURNO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
