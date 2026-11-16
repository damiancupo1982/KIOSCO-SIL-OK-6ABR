import { supabase, CourtReservation, CourtReservationHistory, CourtSession } from '../../lib/supabase';
import {
  addDaysISO,
  eventSummary,
  formatClock,
  formatDateTime,
  formatTime,
  localDateOf,
  startOfWeekISO,
  todayISO,
} from './reservasUtils';

export type PeriodKey = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_anterior' | 'rango';

export type BookingStatus = 'anticipada' | 'a_tiempo' | 'carga_tardia' | 'carga_fuera_de_fecha';

export const BOOKING_STATUSES: BookingStatus[] = ['anticipada', 'a_tiempo', 'carga_tardia', 'carga_fuera_de_fecha'];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  anticipada: 'Anticipada',
  a_tiempo: 'A tiempo',
  carga_tardia: 'Carga tardía',
  carga_fuera_de_fecha: 'Carga fuera de fecha',
};

export const BOOKING_STATUS_STYLE: Record<BookingStatus, { badge: string; ring: string }> = {
  anticipada: { badge: 'bg-sky-600', ring: 'ring-sky-400' },
  a_tiempo: { badge: 'bg-emerald-600', ring: 'ring-emerald-400' },
  carga_tardia: { badge: 'bg-orange-600', ring: 'ring-orange-400' },
  carga_fuera_de_fecha: { badge: 'bg-red-600', ring: 'ring-red-500' },
};

export const isNonCompliant = (status: BookingStatus) => status === 'carga_tardia' || status === 'carga_fuera_de_fecha';

export type LateStatus = Exclude<BookingStatus, 'anticipada' | 'a_tiempo'>;

export const bookingStatusAt = (created: Date, date: string, start: string): BookingStatus => {
  if (localDateOf(created.toISOString()) > date) return 'carga_fuera_de_fecha';
  const diffMs = created.getTime() - new Date(`${date}T${start}:00-03:00`).getTime();
  if (diffMs < -10 * 60_000) return 'anticipada';
  if (diffMs <= 30 * 60_000) return 'a_tiempo';
  return 'carga_tardia';
};

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

export interface BookingRecord {
  id: string;
  source: 'reserva' | 'jugado';
  groupKey: string;
  court: number;
  label: string;
  createdAt: string;
  createdBy: string;
  cancelled: boolean;
  bookingStatus: BookingStatus;
  delayMinutes: number;
  scheduledAt: string | null;
  scheduledFallback: string;
  currentSchedule: string;
}

export const scheduledText = (record: BookingRecord) =>
  record.scheduledAt ? formatCreated(record.scheduledAt) : record.scheduledFallback;

export const reservationToRecord = (r: CourtReservation): BookingRecord | null => {
  if (!r.booking_status) return null;
  return {
    id: r.id,
    source: 'reserva',
    groupKey: r.event_group,
    court: r.court,
    label: eventSummary(r) || r.event_type,
    createdAt: r.created_at,
    createdBy: r.created_by,
    cancelled: r.status === 'cancelada',
    bookingStatus: r.booking_status,
    delayMinutes: r.booking_delay_minutes ?? 0,
    scheduledAt: r.booking_scheduled_at,
    scheduledFallback: `${r.reservation_date} ${formatTime(r.start_time)}`,
    currentSchedule: `${r.reservation_date} ${formatTime(r.start_time)}-${formatTime(r.end_time)}`,
  };
};

export const sessionToRecord = (s: CourtSession): BookingRecord | null => {
  if (!s.booking_status) return null;
  const date = localDateOf(s.opened_at);
  const start = formatClock(s.opened_at);
  return {
    id: s.id,
    source: 'jugado',
    groupKey: s.id,
    court: s.court,
    label: `${s.titular_name}${s.titular_lot ? ` · Lote ${s.titular_lot}` : ''}`,
    createdAt: s.created_at,
    createdBy: s.opened_by,
    cancelled: s.status === 'cancelada',
    bookingStatus: s.booking_status,
    delayMinutes: s.booking_delay_minutes ?? 0,
    scheduledAt: s.booking_scheduled_at,
    scheduledFallback: `${date} ${start}`,
    currentSchedule: `${date} ${start}-${s.planned_end ? formatClock(s.planned_end) : ''}`,
  };
};

const fetchReservationRows = async (range: DateRange): Promise<CourtReservation[]> => {
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

const fetchPlayedRows = async (range: DateRange): Promise<CourtSession[]> => {
  const { data, error } = await supabase
    .from('court_sessions')
    .select('*')
    .gte('created_at', dayStart(range.from))
    .lt('created_at', nextDayStart(range.to))
    .not('booking_status', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtSession[];
};

export const fetchBookingRecords = async (range: DateRange): Promise<BookingRecord[]> => {
  const [reservations, played] = await Promise.all([fetchReservationRows(range), fetchPlayedRows(range)]);
  const records = [
    ...reservations.map(reservationToRecord),
    ...played.map(sessionToRecord),
  ].filter((r): r is BookingRecord => r !== null);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

const countableRecords = (records: BookingRecord[]) => {
  const seen = new Set<string>();
  return records.filter((r) => {
    if (r.cancelled || seen.has(r.groupKey)) return false;
    seen.add(r.groupKey);
    return true;
  });
};

export type StatusCounts = Record<BookingStatus, number>;

export interface EmployeeStat {
  name: string;
  total: number;
  counts: StatusCounts;
  nonCompliant: number;
  compliancePct: number;
  avgDelay: number;
}

export interface BookingSummary {
  total: number;
  counts: StatusCounts;
  pcts: StatusCounts;
  compliant: number;
  compliancePct: number;
  nonCompliant: number;
  nonCompliantPct: number;
  employees: EmployeeStat[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, total: number) => (total ? round1((part / total) * 100) : 0);

const countStatuses = (list: BookingRecord[]): StatusCounts => {
  const counts: StatusCounts = { anticipada: 0, a_tiempo: 0, carga_tardia: 0, carga_fuera_de_fecha: 0 };
  for (const r of list) counts[r.bookingStatus] += 1;
  return counts;
};

export const summarizeBookings = (records: BookingRecord[]): BookingSummary => {
  const groups = countableRecords(records);
  const total = groups.length;
  const counts = countStatuses(groups);
  const compliant = counts.anticipada + counts.a_tiempo;
  const nonCompliant = counts.carga_tardia + counts.carga_fuera_de_fecha;
  const pcts = {
    anticipada: pct(counts.anticipada, total),
    a_tiempo: pct(counts.a_tiempo, total),
    carga_tardia: pct(counts.carga_tardia, total),
    carga_fuera_de_fecha: pct(counts.carga_fuera_de_fecha, total),
  };
  const byEmployee = new Map<string, BookingRecord[]>();
  for (const r of groups) {
    const name = r.createdBy.trim() || NO_EMPLOYEE_LABEL;
    byEmployee.set(name, [...(byEmployee.get(name) ?? []), r]);
  }
  const employees: EmployeeStat[] = [...byEmployee.entries()]
    .map(([name, list]) => {
      const late = list.filter((r) => isNonCompliant(r.bookingStatus));
      const delaySum = late.reduce((s, r) => s + r.delayMinutes, 0);
      const empCounts = countStatuses(list);
      return {
        name,
        total: list.length,
        counts: empCounts,
        nonCompliant: late.length,
        compliancePct: pct(empCounts.anticipada + empCounts.a_tiempo, list.length),
        avgDelay: late.length ? Math.round(delaySum / late.length) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
  return {
    total,
    counts,
    pcts,
    compliant,
    compliancePct: pct(compliant, total),
    nonCompliant,
    nonCompliantPct: pct(nonCompliant, total),
    employees,
  };
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
