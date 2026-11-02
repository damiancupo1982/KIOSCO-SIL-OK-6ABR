import { BookingRecord, formatCreated, NO_EMPLOYEE_LABEL, scheduledText } from './bookingControl';
import { formatClock, formatDateTime } from './reservasUtils';
import { CourtSession } from '../../lib/supabase';

export type OpeningRecord = Pick<CourtSession, 'opened_at' | 'opened_by'> | null;

interface BookingInfoCardProps {
  record: BookingRecord;
  opened?: OpeningRecord;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
    <dd className="text-xs font-bold text-slate-800 text-right">{value}</dd>
  </div>
);

export default function BookingInfoCard({ record, opened }: BookingInfoCardProps) {
  const late = record.bookingStatus === 'fuera_de_tiempo';
  const openingText =
    opened === undefined
      ? null
      : opened
        ? `${formatDateTime(opened.opened_at)} ${formatClock(opened.opened_at)} · ${opened.opened_by.trim() || NO_EMPLOYEE_LABEL}`
        : 'Sin apertura registrada';

  return (
    <div className="space-y-2">
      <span
        className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tracking-wide text-white ${
          late ? 'bg-orange-600' : 'bg-emerald-600'
        }`}
      >
        {late ? 'FUERA DE TIEMPO' : 'A TIEMPO'}
      </span>
      <dl>
        <Row label="Horario previsto al cargar" value={scheduledText(record)} />
        <Row label="Carga real" value={formatCreated(record.createdAt)} />
        <Row label="Demora" value={late ? `${record.delayMinutes} min` : 'Sin demora'} />
        <Row label="Cargada por" value={record.createdBy.trim() || NO_EMPLOYEE_LABEL} />
        <Row label="Horario actual" value={record.currentSchedule} />
        {openingText !== null && <Row label="Apertura de cancha" value={openingText} />}
      </dl>
    </div>
  );
}
