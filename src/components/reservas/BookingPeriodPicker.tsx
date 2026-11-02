import { Calendar } from 'lucide-react';
import { DateRange, PERIOD_OPTIONS, PeriodKey } from './bookingControl';

interface BookingPeriodPickerProps {
  period: PeriodKey;
  custom: DateRange;
  onPeriodChange: (period: PeriodKey) => void;
  onCustomChange: (range: DateRange) => void;
}

const inputClass =
  'px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500';

export default function BookingPeriodPicker({ period, custom, onPeriodChange, onCustomChange }: BookingPeriodPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => onPeriodChange(option.key)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              period === option.key
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {period === 'rango' && (
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          <input
            type="date"
            aria-label="Desde"
            value={custom.from}
            onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
            className={inputClass}
          />
          <span className="text-sm text-slate-500">hasta</span>
          <input
            type="date"
            aria-label="Hasta"
            value={custom.to}
            onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
