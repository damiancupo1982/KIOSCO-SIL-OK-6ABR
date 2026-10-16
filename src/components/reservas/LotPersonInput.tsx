import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, UserX } from 'lucide-react';
import { supabase, CourtPlayer } from '../../lib/supabase';

interface SocioOption {
  id: string;
  first_name: string;
  last_name: string;
  category: string;
  carnet_status: string;
  external_id: string | null;
}

interface LotPersonInputProps {
  value: CourtPlayer;
  onChange: (player: CourtPlayer) => void;
  label: string;
  highlight?: boolean;
}

const MANUAL = '__manual__';
const fullName = (s: SocioOption) => `${s.first_name} ${s.last_name}`.trim();
const isExtSearch = (lot: string) => /^ext/i.test(lot.trim());
const statusSuffix = (s: SocioOption) =>
  s.carnet_status === 'baja' ? ' (carnet dado de baja)' : s.carnet_status !== 'activo' ? ' (carnet pausado)' : '';

export default function LotPersonInput({ value, onChange, label, highlight }: LotPersonInputProps) {
  const [options, setOptions] = useState<SocioOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedLot, setSearchedLot] = useState('');
  const [manual, setManual] = useState(!value.socio_id && !!value.name);

  useEffect(() => {
    const lot = value.lot.trim();
    if (!lot) {
      setOptions([]);
      setSearchedLot('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const base = supabase.from('socios').select('id, first_name, last_name, category, carnet_status, external_id');
      const digits = lot.replace(/\D/g, '');
      const { data, error } = isExtSearch(lot)
        ? await (digits
            ? base.eq('tipo_socio', 'EXTERNO').ilike('external_id', `%${digits}`)
            : base.eq('tipo_socio', 'EXTERNO')
          ).order('external_id')
        : await base.eq('tipo_socio', 'INTERNO').eq('lot_number', lot).order('category');
      if (cancelled) return;
      setLoading(false);
      setSearchedLot(lot);
      const found = error ? [] : (data as SocioOption[]) || [];
      setOptions(found);
      if (!value.socio_id && value.name.trim()) {
        const match = found.find((o) => fullName(o).toLowerCase() === value.name.trim().toLowerCase());
        if (match) {
          setManual(false);
          onChange({ ...value, name: fullName(match), socio_id: match.id, is_socio: match.carnet_status === 'activo' });
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value.lot]);

  const lotSearched = !!value.lot.trim() && searchedLot === value.lot.trim() && !loading;
  const noSocios = lotSearched && options.length === 0;
  const showNameInput = noSocios || manual;
  const selected = options.find((o) => o.id === value.socio_id);
  const extMode = isExtSearch(value.lot);

  const handleLot = (lot: string) => {
    setManual(false);
    onChange({ lot, name: '', socio_id: null, is_socio: false });
  };

  const handleSelect = (id: string) => {
    if (id === MANUAL) {
      setManual(true);
      onChange({ ...value, name: '', socio_id: null, is_socio: false });
      return;
    }
    setManual(false);
    const socio = options.find((o) => o.id === id);
    if (!socio) {
      onChange({ ...value, name: '', socio_id: null, is_socio: false });
      return;
    }
    onChange({ ...value, name: fullName(socio), socio_id: socio.id, is_socio: socio.carnet_status === 'activo' });
  };

  const status = !value.name.trim()
    ? null
    : value.is_socio
    ? 'socio'
    : selected
    ? 'pausado'
    : 'invitado';

  const borderClass =
    status === 'socio'
      ? 'border-emerald-400 bg-emerald-50/60'
      : status === 'invitado' || status === 'pausado'
      ? 'border-red-300 bg-red-50/60'
      : highlight
      ? 'border-sky-200 bg-sky-50/40'
      : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-xl border-2 p-3 transition-colors ${borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</span>
        {status === 'socio' && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={14} /> SOCIO
          </span>
        )}
        {status === 'invitado' && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
            <UserX size={14} /> INVITADO
          </span>
        )}
        {status === 'pausado' && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
            <UserX size={14} /> {selected?.carnet_status === 'baja' ? 'CARNET DE BAJA' : 'CARNET PAUSADO'} - INVITADO
          </span>
        )}
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Lote / EXT"
            title="Numero de lote, o EXT-0001 para socios externos"
            value={value.lot}
            onChange={(e) => handleLot(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
          />
          {loading && <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
        </div>
        {!value.lot.trim() ? (
          <div className="px-3 py-2.5 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg bg-white">
            Ingrese el lote o EXT-0001
          </div>
        ) : options.length > 0 && !manual ? (
          <select
            value={value.socio_id ?? ''}
            onChange={(e) => handleSelect(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500"
          >
            <option value="">{extMode ? 'Seleccionar socio externo...' : 'Seleccionar persona del lote...'}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {extMode && o.external_id ? `${o.external_id} - ` : ''}
                {fullName(o)}
                {statusSuffix(o)}
              </option>
            ))}
            <option value={MANUAL}>Otra persona (invitado)...</option>
          </select>
        ) : showNameInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={noSocios ? (extMode ? 'Externo no encontrado - nombre del invitado' : 'Lote sin socios - nombre del invitado') : 'Nombre del invitado'}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value, socio_id: null, is_socio: false })}
              className="flex-1 min-w-0 px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500"
            />
            {manual && options.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className="px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 rounded-lg"
              >
                Socios
              </button>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-sm text-slate-400 border-2 border-slate-200 rounded-lg bg-white">Buscando...</div>
        )}
      </div>
    </div>
  );
}
