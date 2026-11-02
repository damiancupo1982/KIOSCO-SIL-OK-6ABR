import { supabase, CourtReservation, CourtReservationHistory, CourtSession } from '../../lib/supabase';
import { addDaysISO, formatClock, formatDateTime, startOfWeekISO, todayISO } from './reservasUtils';

export type PeriodKey = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_anterior' | 'rango';

export interface DateRange {
  from: string;
  to: string;
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_anterior', label: 'Mes anterior' },
  { key: 'rango', label: 'Rango personalizado' },
];

export const NO_EMPLOYEE_LABEL = 'Sin usuario registrado';

const dayStart = (iso: string) => `${iso}T00:00:00-03:00`;
const nextDayStart = (iso: string) => dayStart(addDaysISO(iso, 1));

export const periodRange = (key: Exclude<PeriodKey, 'rango'>): DateRange => {
  const today = todayISO();
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  switch (key) {
    case 'hoy':
      return { from: today, to: today };
    case 'ayer': {
      const yesterday = addDaysISO(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'semana':
      return { from: startOfWeekISO(today), to: today };
    case 'mes':
      return { from: firstOfMonth, to: today };
    case 'mes_anterior': {
      const lastDayPrev = addDaysISO(firstOfMonth, -1);
      return { from: `${lastDayPrev.slice(0, 7)}-01`, to: lastDayPrev };
    }
  }
};

export const resolveRange = (key: PeriodKey, custom: DateRange): DateRange =>
  key === 'rango' ? custom : periodRange(key);

export const formatCreated = (ts: string) => `${formatDateTime(ts)} ${formatClock(ts)}`;

export const formatScheduledAt = (ts: string | null, fallbackDate: string, fallbackTime: string) =>
  ts ? `${formatDateTime(ts)} ${formatClock(ts)}` : `${fallbackDate} ${fallbackTime.slice(0, 5)}`;

export const fetchBookingRows = async (range: DateRange): Promise<CourtReservation[]> => {
  const { data, error } = await supabase
    .from('court_reservations')
    .select('*')
    .gte('created_at', dayStart(range.from))
    .lt('created_at', nextDayStart(range.to))
    .not('booking_status', 'is', null)
    .in('event_type', ['reserva', 'clase', 'torneo'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtReservation[];
};

export const fetchOpeningsInRange = async (range: DateRange): Promise<CourtSession[]> => {
  const { data, error } = await supabase
    .from('court_sessions')
    .select('*')
    .gte('opened_at', dayStart(range.from))
    .lt('opened_at', nextDayStart(range.to));
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtSession[];
};

export const fetchOpenings = async (reservationIds: string[]): Promise<CourtSession[]> => {
  if (!reservationIds.length) return [];
  const { data, error } = await supabase.from('court_sessions').select('*').in('reservation_id', reservationIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtSession[];
};

export const fetchScheduleChanges = async (reservationIds: string[]): Promise<CourtReservationHistory[]> => {
  if (!reservationIds.length) return [];
  const { data, error } = await supabase
    .from('court_reservation_history')
    .select('*')
    .in('reservation_id', reservationIds)
    .order('changed_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtReservationHistory[];
};

const countableRows = (rows: CourtReservation[]) => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (r.status === 'cancelada' || seen.has(r.event_group)) return false;
    seen.add(r.event_group);
    return true;
  });
};

export interface EmployeeStat {
  name: string;
  total: number;
  late: number;
  latePct: number;
  avgDelay: number;
}

export interface BookingSummary {
  total: number;
  late: number;
  onTime: number;
  latePct: number;
  onTimePct: number;
  employees: EmployeeStat[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const summarizeBookings = (rows: CourtReservation[]): BookingSummary => {
  const groups = countableRows(rows);
  const total = groups.length;
  const late = groups.filter((r) => r.booking_status === 'fuera_de_tiempo').length;
  const latePct = total ? round1((late / total) * 100) : 0;
  const byEmployee = new Map<string, CourtReservation[]>();
  for (const r of groups) {
    const name = r.created_by.trim() || NO_EMPLOYEE_LABEL;
    byEmployee.set(name, [...(byEmployee.get(name) ?? []), r]);
  }
  const employees: EmployeeStat[] = [...byEmployee.entries()]
    .map(([name, list]) => {
      const lateList = list.filter((r) => r.booking_status === 'fuera_de_tiempo');
      const delaySum = lateList.reduce((s, r) => s + (r.booking_delay_minutes ?? 0), 0);
      return {
        name,
        total: list.length,
        late: lateList.length,
        latePct: round1((lateList.length / list.length) * 100),
        avgDelay: lateList.length ? Math.round(delaySum / lateList.length) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
  return { total, late, onTime: total - late, latePct, onTimePct: total ? round1(100 - latePct) : 0, employees };
};

const csvSafe = (value: string | number) => {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

export const downloadCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
  const line = (cells: (string | number)[]) => cells.map((c) => `"${csvSafe(c).replace(/"/g, '""')}"`).join(';');
  const body = [header, ...rows].map(line).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
