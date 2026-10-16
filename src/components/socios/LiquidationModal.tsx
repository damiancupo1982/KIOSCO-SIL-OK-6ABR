import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Printer, Share2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { calcExternoCost, calcLotCostDetailed } from './carnetCalc';
import { Barrio, CarnetPrices, Socio, STATUS_BADGE, STATUS_LABEL, categoryLabel, currentMonth, monthRange, socioFullName } from './types';

interface LiquidationModalProps {
  socios: Socio[];
  barrios: Barrio[];
  prices: CarnetPrices | null;
  onClose: () => void;
  onShowMovements: (month: string) => void;
}

const money = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
const externoCarnet = (s: Socio) => `Individual${s.tiene_tenis ? ' + Tenis' : ''}`;

export default function LiquidationModal({ socios, barrios, prices, onClose, onShowMovements }: LiquidationModalProps) {
  const [barrioId, setBarrioId] = useState('');
  const [expandedLot, setExpandedLot] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [audit, setAudit] = useState<{ bajas: number; pausas: number; reactivaciones: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAudit(null);
    (async () => {
      const r = monthRange(month);
      const { data, error } = await supabase.from('carnet_status_history').select('action').gte('created_at', r.from).lt('created_at', r.to);
      if (cancelled || error || !data) return;
      setAudit({
        bajas: data.filter(d => d.action === 'BAJA').length,
        pausas: data.filter(d => d.action === 'PAUSADO').length,
        reactivaciones: data.filter(d => d.action === 'REACTIVADO').length,
      });
    })();
    return () => { cancelled = true; };
  }, [month]);

  const silRows = useMemo(() => {
    const lots = new Map<string, { barrio: string; lot: string; socios: Socio[] }>();
    socios
      .filter(s => s.tipo_socio === 'INTERNO' && (!barrioId || s.barrio_id === barrioId))
      .forEach(s => {
        const key = `${s.barrio_id}-${s.lot_number}`;
        if (!lots.has(key)) lots.set(key, { barrio: s.barrio?.name || '', lot: s.lot_number, socios: [] });
        lots.get(key)!.socios.push(s);
      });
    return Array.from(lots.values())
      .map(g => ({ ...g, calc: calcLotCostDetailed(g.socios, prices) }))
      .filter(g => g.calc.total_final > 0)
      .sort((a, b) => a.barrio.localeCompare(b.barrio) || a.lot.localeCompare(b.lot, undefined, { numeric: true }));
  }, [socios, barrioId, prices]);

  const extRows = useMemo(() =>
    socios
      .filter(s => s.tipo_socio === 'EXTERNO')
      .map(s => ({ socio: s, calc: calcExternoCost(s, prices) }))
      .sort((a, b) => (a.socio.external_id || '').localeCompare(b.socio.external_id || '')),
  [socios, prices]);

  const silTotals = useMemo(() => ({
    bruto: silRows.reduce((s, r) => s + r.calc.total_bruto, 0),
    descuento: silRows.reduce((s, r) => s + r.calc.total_descuento, 0),
    final: silRows.reduce((s, r) => s + r.calc.total_final, 0),
  }), [silRows]);

  const extTotal = useMemo(() => extRows.reduce((s, r) => s + r.calc.total_final, 0), [extRows]);

  const exportExcel = () => {
    const silSheet = XLSX.utils.aoa_to_sheet([
      ['Barrio', 'Lote', 'Monto Bruto', 'Descuento Tenis', 'Monto Final'],
      ...silRows.map(r => [r.barrio, r.lot, r.calc.total_bruto, r.calc.total_descuento, r.calc.total_final]),
      ['', 'TOTAL SIL', silTotals.bruto, silTotals.descuento, silTotals.final],
    ]);
    const extSheet = XLSX.utils.aoa_to_sheet([
      ['ID externo', 'Nombre y apellido', 'DNI', 'Tipo de carnet', 'Valor', 'Estado', 'Fecha de alta'],
      ...extRows.map(r => [
        r.socio.external_id || '', socioFullName(r.socio), r.socio.dni, externoCarnet(r.socio),
        r.calc.total_final, STATUS_LABEL[r.socio.carnet_status], fmtDate(r.socio.created_at),
      ]),
      ['', 'TOTAL EXTERNOS', '', '', extTotal, '', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, silSheet, 'SOCIOS SIL');
    XLSX.utils.book_append_sheet(wb, extSheet, 'SOCIOS EXTERNOS');
    XLSX.writeFile(wb, `liquidacion_socios_${month}.xlsx`);
  };

  const printLiquidation = () => {
    const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const silHtml = silRows.map(r =>
      `<tr><td>${esc(r.barrio)}</td><td>${esc(r.lot)}</td><td>${money(r.calc.total_bruto)}</td><td>${money(r.calc.total_descuento)}</td><td>${money(r.calc.total_final)}</td></tr>`
    ).join('');
    const extHtml = extRows.map(r =>
      `<tr><td>${esc(r.socio.external_id || '')}</td><td>${esc(socioFullName(r.socio))}</td><td>${esc(r.socio.dni)}</td><td>${externoCarnet(r.socio)}</td><td>${money(r.calc.total_final)}</td><td>${STATUS_LABEL[r.socio.carnet_status]}</td><td>${fmtDate(r.socio.created_at)}</td></tr>`
    ).join('');
    const style = 'body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f1f5f9}tr.total td{font-weight:bold;background:#fef9c3}';
    const html = `<html><head><title>Liquidacion</title><style>${style}</style></head><body>
      <h2>Liquidacion de Carnets - Socios SIL</h2>
      <table><thead><tr><th>Barrio</th><th>Lote</th><th>Bruto</th><th>Desc. Tenis</th><th>Final</th></tr></thead><tbody>${silHtml}<tr class="total"><td></td><td>TOTAL SIL</td><td>${money(silTotals.bruto)}</td><td>${money(silTotals.descuento)}</td><td>${money(silTotals.final)}</td></tr></tbody></table>
      <h2>Socios Externos</h2>
      <table><thead><tr><th>ID externo</th><th>Nombre y apellido</th><th>DNI</th><th>Tipo de carnet</th><th>Valor</th><th>Estado</th><th>Fecha de alta</th></tr></thead><tbody>${extHtml}<tr class="total"><td></td><td>TOTAL EXTERNOS</td><td></td><td></td><td>${money(extTotal)}</td><td></td><td></td></tr></tbody></table>
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const shareLiquidation = () => {
    const lines = [
      'LIQUIDACION DE CARNETS - SOCIOS SIL', '---',
      ...silRows.map(r => `${r.barrio} | Lote ${r.lot} | Bruto: ${money(r.calc.total_bruto)} | Desc: ${money(r.calc.total_descuento)} | Final: ${money(r.calc.total_final)}`),
      `--- TOTAL SIL: ${money(silTotals.final)}`, '',
      'SOCIOS EXTERNOS', '---',
      ...extRows.map(r => `${r.socio.external_id} | ${socioFullName(r.socio)} | ${STATUS_LABEL[r.socio.carnet_status]} | ${money(r.calc.total_final)}`),
      `--- TOTAL EXTERNOS: ${money(extTotal)}`,
    ];
    if (navigator.share) navigator.share({ title: 'Liquidacion', text: lines.join('\n') });
    else { navigator.clipboard.writeText(lines.join('\n')); alert('Copiado al portapapeles'); }
  };

  const th = 'py-2 px-3 font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">Liquidacion de Carnets</h3>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors" title="Exportar Excel"><Download size={16} /> Excel</button>
            <button onClick={printLiquidation} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Imprimir"><Printer size={18} /></button>
            <button onClick={shareLiquidation} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Compartir"><Share2 size={18} /></button>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
          </div>
        </div>

        <div className="mx-4 mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
          <AlertCircle size={20} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-[220px] text-sm text-amber-900">
            <p className="font-semibold">Movimientos de carnets durante este mes:</p>
            <p>{audit ? `${audit.bajas} bajas, ${audit.pausas} pausas, ${audit.reactivaciones} reactivaciones` : 'Cargando...'}</p>
          </div>
          <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="px-3 py-1.5 border border-amber-200 rounded-lg text-sm bg-white" />
          <button onClick={() => onShowMovements(month)} className="px-3 py-1.5 text-xs font-bold tracking-wide text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors">
            VER MOVIMIENTOS DEL MES
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          <section>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h4 className="text-sm font-bold uppercase tracking-wide text-teal-800">Socios SIL</h4>
              <select value={barrioId} onChange={e => setBarrioId(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
                <option value="">Todos los barrios</option>
                {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-4 text-sm">
                <span className="text-slate-600">Bruto: <strong>{money(silTotals.bruto)}</strong></span>
                {silTotals.descuento > 0 && <span className="text-emerald-600">Desc: <strong>-{money(silTotals.descuento)}</strong></span>}
                <span className="text-amber-700 font-bold">Total SIL: {money(silTotals.final)}</span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={`text-left ${th}`}>Barrio</th>
                  <th className={`text-left ${th}`}>Lote</th>
                  <th className={`text-right ${th}`}>Bruto</th>
                  <th className={`text-right ${th}`}>Desc. Tenis</th>
                  <th className={`text-right ${th}`}>Final</th>
                  <th className={`text-center ${th}`}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {silRows.map(r => {
                  const lotKey = `${r.barrio}-${r.lot}`;
                  const isExpanded = expandedLot === lotKey;
                  return [
                    <tr key={lotKey} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3">{r.barrio}</td>
                      <td className="py-2 px-3">{r.lot}</td>
                      <td className="py-2 px-3 text-right">{money(r.calc.total_bruto)}</td>
                      <td className="py-2 px-3 text-right text-emerald-600">{r.calc.total_descuento > 0 ? `-${money(r.calc.total_descuento)}` : '-'}</td>
                      <td className="py-2 px-3 text-right font-medium">{money(r.calc.total_final)}</td>
                      <td className="py-2 px-3 text-center">
                        <button onClick={() => setExpandedLot(isExpanded ? null : lotKey)} className="text-xs text-teal-600 hover:text-teal-800 font-medium">{isExpanded ? 'Ocultar' : 'Ver'}</button>
                      </td>
                    </tr>,
                    ...(isExpanded ? r.calc.details.map((d, di) => (
                      <tr key={`${lotKey}-${di}`} className="bg-slate-50 border-b border-slate-100">
                        <td className="py-1 px-3 pl-8 text-xs text-slate-500" colSpan={2}>
                          {d.socio_name} <span className="text-slate-400">({categoryLabel(d.category)})</span>
                          {d.tiene_tenis && <span className="ml-1 text-cyan-600">TENIS</span>}
                        </td>
                        <td className="py-1 px-3 text-right text-xs">{money(d.base_price)}</td>
                        <td className="py-1 px-3 text-right text-xs text-emerald-600">{d.discount > 0 ? `-${money(d.discount)}` : '-'}</td>
                        <td className="py-1 px-3 text-right text-xs font-medium">{money(d.final_price)}</td>
                        <td></td>
                      </tr>
                    )) : []),
                  ];
                })}
                {silRows.length > 0 && (
                  <tr className="bg-amber-50 font-bold">
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3">TOTAL SIL</td>
                    <td className="py-2 px-3 text-right">{money(silTotals.bruto)}</td>
                    <td className="py-2 px-3 text-right text-emerald-700">{silTotals.descuento > 0 ? `-${money(silTotals.descuento)}` : '-'}</td>
                    <td className="py-2 px-3 text-right text-amber-700">{money(silTotals.final)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
            {silRows.length === 0 && <p className="text-center text-slate-500 py-6">No hay lotes para liquidar. Revisa los precios del carnet.</p>}
          </section>

          <section>
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-sm font-bold uppercase tracking-wide text-sky-800">Socios Externos</h4>
              <span className="text-xs text-slate-500">No se liquidan al barrio</span>
              <span className="ml-auto text-sm font-bold text-sky-800">Total Externos: {money(extTotal)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className={th}>ID externo</th>
                  <th className={th}>Nombre y apellido</th>
                  <th className={th}>DNI</th>
                  <th className={th}>Tipo de carnet</th>
                  <th className={`text-right ${th}`}>Valor</th>
                  <th className={th}>Estado</th>
                  <th className={th}>Fecha de alta</th>
                </tr>
              </thead>
              <tbody>
                {extRows.map(r => (
                  <tr key={r.socio.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-xs font-semibold">{r.socio.external_id}</td>
                    <td className="py-2 px-3">{socioFullName(r.socio)}</td>
                    <td className="py-2 px-3">{r.socio.dni || '-'}</td>
                    <td className="py-2 px-3">{externoCarnet(r.socio)}</td>
                    <td className="py-2 px-3 text-right font-medium">{money(r.calc.total_final)}</td>
                    <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[r.socio.carnet_status]}`}>{STATUS_LABEL[r.socio.carnet_status]}</span></td>
                    <td className="py-2 px-3">{fmtDate(r.socio.created_at)}</td>
                  </tr>
                ))}
                {extRows.length > 0 && (
                  <tr className="bg-sky-50 font-bold">
                    <td className="py-2 px-3" colSpan={4}>TOTAL EXTERNOS</td>
                    <td className="py-2 px-3 text-right text-sky-800">{money(extTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
            {extRows.length === 0 && <p className="text-center text-slate-500 py-6">No hay socios externos cargados</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
