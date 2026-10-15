import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarPlus, History, LayoutGrid } from 'lucide-react';
import { supabase, CourtReservation, CourtSession, Shift } from '../../lib/supabase';
import CourtCard from './CourtCard';
import ReservationModal from './ReservationModal';
import OpenCourtModal from './OpenCourtModal';
import TurnoView from './TurnoView';
import ReservationsCalendar from './ReservationsCalendar';
import TurnosHistory from './TurnosHistory';
import { COURTS, formatTime, nowTimeHHMM, todayISO } from './reservasUtils';

type Tab = 'canchas' | 'agenda' | 'historial';

interface ReservationDraft {
  reservation?: CourtReservation;
  court: number;
  date?: string;
  time?: string;
}

interface OpenDraft {
  court: number;
  reservation?: CourtReservation;
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export default function Reservas({ shift }: { shift: Shift | null }) {
  const userName = shift?.user_name ?? '';
  const [tab, setTab] = useState<Tab>('canchas');
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CourtSession[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [todayReservations, setTodayReservations] = useState<CourtReservation[]>([]);
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft | null>(null);
  const [openDraft, setOpenDraft] = useState<OpenDraft | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState('');

  const loadBoard = useCallback(async () => {
    const [sessionsRes, reservationsRes] = await Promise.all([
      supabase.from('court_sessions').select('*').eq('status', 'abierta'),
      supabase
        .from('court_reservations')
        .select('*')
        .eq('reservation_date', todayISO())
        .eq('status', 'reservada')
        .order('start_time'),
    ]);
    if (sessionsRes.error || reservationsRes.error) {
      setLoadError('No se pudo cargar el estado de las canchas.');
      return;
    }
    setLoadError('');
    const open = (sessionsRes.data as CourtSession[]) || [];
    setSessions(open);
    setTodayReservations((reservationsRes.data as CourtReservation[]) || []);

    if (open.length) {
      const { data: items } = await supabase
        .from('court_session_items')
        .select('session_id, price, quantity')
        .in('session_id', open.map((s) => s.id));
      const sums: Record<string, number> = {};
      for (const i of items || []) {
        sums[i.session_id] = (sums[i.session_id] ?? 0) + Number(i.price) * i.quantity;
      }
      setTotals(sums);
    } else {
      setTotals({});
    }
  }, []);

  useEffect(() => {
    loadBoard();
    const timer = setInterval(loadBoard, 30000);
    return () => clearInterval(timer);
  }, [loadBoard, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const upcomingReservation = (court: number) => {
    const now = minutesOf(nowTimeHHMM());
    return todayReservations.find(
      (r) => r.court === court && minutesOf(formatTime(r.start_time)) >= now - 60
    );
  };

  if (turnoId) {
    return (
      <TurnoView
        sessionId={turnoId}
        shift={shift}
        onBack={() => {
          setTurnoId(null);
          refresh();
        }}
        onClosed={() => {
          setTurnoId(null);
          refresh();
        }}
      />
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'canchas', label: 'Canchas', icon: LayoutGrid },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'historial', label: 'Historial', icon: History },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setReservationDraft({ court: 0 })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow transition-colors"
        >
          <CalendarPlus size={18} /> Nueva reserva
        </button>
      </div>

      {loadError && <p className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</p>}

      {tab === 'canchas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {COURTS.map((court) => {
            const session = sessions.find((s) => s.court === court);
            const reservation = session ? undefined : upcomingReservation(court);
            return (
              <CourtCard
                key={court}
                court={court}
                session={session}
                sessionTotal={session ? totals[session.id] ?? 0 : 0}
                reservation={reservation}
                onSchedule={() => setReservationDraft({ court })}
                onOpen={() => setOpenDraft({ court })}
                onViewReservation={() => reservation && setReservationDraft({ court, reservation })}
                onViewTurno={() => session && setTurnoId(session.id)}
              />
            );
          })}
        </div>
      )}

      {tab === 'agenda' && (
        <ReservationsCalendar
          refreshKey={refreshKey}
          onEdit={(reservation) =>
            reservation.status === 'abierta' && reservation.session_id
              ? setTurnoId(reservation.session_id)
              : setReservationDraft({ court: reservation.court, reservation })
          }
          onCreate={(court, date, time) => setReservationDraft({ court, date, time })}
        />
      )}

      {tab === 'historial' && <TurnosHistory refreshKey={refreshKey} />}

      {reservationDraft && (
        <ReservationModal
          reservation={reservationDraft.reservation}
          defaultCourt={reservationDraft.court}
          defaultDate={reservationDraft.date}
          defaultTime={reservationDraft.time}
          userName={userName}
          onClose={() => setReservationDraft(null)}
          onSaved={() => {
            setReservationDraft(null);
            refresh();
          }}
          onOpenCourt={(reservation) => {
            setReservationDraft(null);
            setOpenDraft({ court: reservation.court, reservation });
          }}
        />
      )}

      {openDraft && (
        <OpenCourtModal
          court={openDraft.court}
          reservation={openDraft.reservation}
          userName={userName}
          onClose={() => setOpenDraft(null)}
          onOpened={(sessionId) => {
            setOpenDraft(null);
            refresh();
            setTurnoId(sessionId);
          }}
        />
      )}
    </div>
  );
}
