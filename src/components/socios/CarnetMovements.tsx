import { useEffect, useMemo, useState } from 'react';
import { Download, History, Loader2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { ACTION_BADGE, ART_OFFSET, CarnetHistoryEntry, categoryLabel, formatDateTime, monthRange } from './types';

interface CarnetMovementsProps {
  initialMonth?: string;
  onClose: () => void;
}

const inputClass = 'px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent';

const lotOrExt = (h: CarnetHistoryEntry) => (h.tipo_socio === 'EXTERNO' ? h.external_id || 'EXTERNO' : `Lote ${h.lot_number}`);

export default function CarnetMovements({ initialMonth = '', onClose }: CarnetMovementsProps) {
  const [entries, setEntries] = useState<CarnetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(initialMonth);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [socioTerm, setSocioTerm] = useState('');
  const [lotTerm, setLotTerm] = useState('');
  const [tipo, setTipo] = useState('');
  const [operator, setOperator] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      let query = supabase.from('carnet_status_history').select('*').order('created_at', { ascending: false });
      if (month) {
        const r = monthRange(month);
        query = query.gte('created_at', r.from).lt('created_at', r.to);
      } else {
        if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00${ART_OFFSET}`);
        if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999${ART_OFFSET}`);
      }
      const { data, error: err } = await query.limit(5000);
      if (cancelled) return;
      if (err) setError('No se pudo cargar el historial.');
      setEntries(err ? [] : ((data || []) as CarnetHistoryEntry[]));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [month, dateFrom, dateTo]);

  const operators = useMemo(() => Array.from(new Set(entries.map(e => e.user_name).filter(Boolean))).sort(), [entries]);

  const filtered = useMemo(() => {
    const st = socioTerm.trim().toLowerCase();
    const lt = lotTerm.trim().toLowerCase();
    return entries.filter(e =>
      (!st || e.socio_name.toLowerCase().includes(st)) &&
      (!lt || e.lot_number.toLowerCase() === lt || (e.external_id || '').toLowerCase().includes(lt)) &&
      (!tipo || e.tipo_socio === tipo) &&
      (!operator || e.user_name === operator) &&
      (!action || e.action === action)
    );
  }, [entries, socioTerm, lotTerm, tipo, operator, action]);

  const counts = useMemo(() => ({
    BAJA: filtered.filter(e => e.action === 'BAJA').length,
    PAUSADO: filtered.filter(e => e.action === 'PAUSADO').length,
    REACTIVADO: filtered.filter(e => e.action === 'REACTIVADO').length,
  }), [filtered]);

  const exportExcel = () => {
    const rows = filtered.map(e => ({
      Fecha: formatDateTime(e.created_at),
      Socio: e.socio_name,
      'Lote / ID externo': lotOrExt(e),
      'Tipo de socio': e.tipo_socio,
      'Tipo de carnet': categoryLabel(e.category),
      Accion: e.action,
      Usuario: e.user_name,
      Motivo: e.reason,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'BAJAS Y PAUSAS');
    XLSX.writeFile(wb, `bajas_y_pausas${month ? `_${month}` : ''}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg"><History size={20} className="text-slate-700" /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Bajas y Pausas</h3>
              <p className="text-xs text-slate-500">Historial permanente de movimientos de carnets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} disabled={filtered.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-40" title="Exportar Excel"><Download size={18} /></button>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Mes
            <input type="month" value={month} onChange={e => { setMonth(e.target.value); setDateFrom(''); setDateTo(''); }} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Desde
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setMonth(''); }} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Hasta
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setMonth(''); }} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Socio
            <input type="text" placeholder="Nombre..." value={socioTerm} onChange={e => setSocioTerm(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Lote / ID externo
            <input type="text" placeholder="Ej: 120 o EXT-0025" value={lotTerm} onChange={e => setLotTerm(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Tipo de socio
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              <option value="INTERNO">Internos (SIL)</option>
              <option value="EXTERNO">Externos</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Operador
            <select value={operator} onChange={e => setOperator(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {operators.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Movimiento
            <select value={action} onChange={e => setAction(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              <option value="PAUSADO">Pausado</option>
              <option value="BAJA">Baja</option>
              <option value="REACTIVADO">Reactivado</option>
            </select>
          </label>
        </div>

        <div className="px-4 pt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">{counts.BAJA} bajas</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">{counts.PAUSADO} pausas</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">{counts.REACTIVADO} reactivaciones</span>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-teal-600" /></div>
          ) : error ? (
            <p className="text-center text-red-600 py-8">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No hay movimientos para los filtros elegidos</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 px-2 font-semibold">Fecha</th>
                  <th className="py-2 px-2 font-semibold">Socio</th>
                  <th className="py-2 px-2 font-semibold">Lote / ID externo</th>
                  <th className="py-2 px-2 font-semibold">Tipo de carnet</th>
                  <th className="py-2 px-2 font-semibold">Acción</th>
                  <th className="py-2 px-2 font-semibold">Usuario</th>
                  <th className="py-2 px-2 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-2 whitespace-nowrap text-slate-600">{formatDateTime(e.created_at)}</td>
                    <td className="py-2 px-2 font-medium text-slate-800">{e.socio_name}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {lotOrExt(e)}
                      {e.tipo_socio === 'EXTERNO' && <span className="ml-1.5 text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">EXTERNO</span>}
                    </td>
                    <td className="py-2 px-2">{categoryLabel(e.category)}</td>
                    <td className="py-2 px-2"><span className={`text-xs font-bold px-2 py-0.5 rounded ${ACTION_BADGE[e.action]}`}>{e.action}</span></td>
                    <td className="py-2 px-2">{e.user_name}</td>
                    <td className="py-2 px-2 text-slate-600">{e.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
