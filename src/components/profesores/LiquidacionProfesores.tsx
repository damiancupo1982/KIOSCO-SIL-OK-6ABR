import { useState, useEffect, useMemo } from 'react';
import { supabase, Professor, ProfessorClass, ProfessorSettlement, ProfessorSettlementPayment } from '../../lib/supabase';
import {
  GraduationCap, Search, Calendar, DollarSign, Percent, CheckCircle2, Loader2,
  Wallet, FileText, ChevronDown, ChevronRight, X, Save, Filter,
} from 'lucide-react';

const inputClass =
  'w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition';

const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5';

type Tab = 'liquidacion' | 'historial';

function fmtPesos(n: number): string {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO(): string {
  const now = new Date();
  const arg = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  return `${arg.getFullYear()}-${String(arg.getMonth() + 1).padStart(2, '0')}-${String(arg.getDate()).padStart(2, '0')}`;
}

function firstOfMonthISO(): string {
  const now = new Date();
  const arg = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  return `${arg.getFullYear()}-${String(arg.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function LiquidacionProfesores({ userName, shiftId }: { userName: string; shiftId: string | null }) {
  const [tab, setTab] = useState<Tab>('liquidacion');
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [classes, setClasses] = useState<ProfessorClass[]>([]);
  const [settlements, setSettlements] = useState<(ProfessorSettlement & { payments: ProfessorSettlementPayment[]; item_count: number })[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [fromDate, setFromDate] = useState(firstOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());
  const [profFilter, setProfFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pendiente');

  // Class selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);

  // Payment modal
  const [payModal, setPayModal] = useState<ProfessorSettlement | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  // Expanded settlement rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProfessors();
  }, []);

  useEffect(() => {
    if (tab === 'liquidacion') loadClasses();
    if (tab === 'historial') loadSettlements();
  }, [tab, fromDate, toDate, profFilter, statusFilter]);

  const loadProfessors = async () => {
    const { data } = await supabase.from('professors').select('*').order('name');
    setProfessors((data || []) as Professor[]);
  };

  const loadClasses = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    setRateOverrides({});
    let query = supabase
      .from('professor_classes')
      .select('*')
      .gte('class_date', fromDate)
      .lte('class_date', toDate)
      .order('class_date', { ascending: false });
    if (profFilter !== 'all') query = query.eq('professor_id', profFilter);
    if (statusFilter !== 'all') {
      if (statusFilter === 'pendiente') query = query.eq('settlement_status', 'pendiente');
      if (statusFilter === 'liquidada') query = query.eq('settlement_status', 'liquidada');
    }
    const { data } = await query;
    setClasses((data || []) as ProfessorClass[]);
    setLoading(false);
  };

  const loadSettlements = async () => {
    setLoading(true);
    let query = supabase.from('professor_settlements').select('*').order('created_at', { ascending: false });
    if (profFilter !== 'all') query = query.eq('professor_id', profFilter);
    const { data: settData } = await query;
    const settlements = (settData || []) as ProfessorSettlement[];
    if (settlements.length === 0) {
      setSettlements([]);
      setLoading(false);
      return;
    }
    const settlementIds = settlements.map((s) => s.id);
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from('professor_settlement_items').select('settlement_id, professor_class_id').in('settlement_id', settlementIds),
      supabase.from('professor_settlement_payments').select('*').in('settlement_id', settlementIds).order('payment_date', { ascending: false }),
    ]);
    const itemCountMap: Record<string, number> = {};
    (items || []).forEach((it: any) => {
      itemCountMap[it.settlement_id] = (itemCountMap[it.settlement_id] || 0) + 1;
    });
    const paymentsMap: Record<string, ProfessorSettlementPayment[]> = {};
    (payments || []).forEach((p: ProfessorSettlementPayment) => {
      if (!paymentsMap[p.settlement_id]) paymentsMap[p.settlement_id] = [];
      paymentsMap[p.settlement_id].push(p);
    });
    setSettlements(settlements.map((s) => ({
      ...s,
      item_count: itemCountMap[s.id] || 0,
      payments: paymentsMap[s.id] || [],
    })));
    setLoading(false);
  };

  const pendienteClasses = useMemo(() => classes.filter((c) => c.settlement_status === 'pendiente'), [classes]);
  const liquidadaClasses = useMemo(() => classes.filter((c) => c.settlement_status === 'liquidada'), [classes]);

  const selectedClasses = useMemo(
    () => pendienteClasses.filter((c) => selectedIds.has(c.id)),
    [pendienteClasses, selectedIds]
  );

  const summary = useMemo(() => {
    const totalGross = selectedClasses.reduce((s, c) => s + Number(c.gross_amount), 0);
    const totalCollected = selectedClasses.reduce((s, c) => s + Number(c.collected_amount), 0);
    const totalCommission = selectedClasses.reduce((s, c) => {
      const rate = rateOverrides[c.id] ?? Number(c.commission_rate);
      return s + (Number(c.collected_amount) * rate / 100);
    }, 0);
    return { totalGross, totalCollected, totalCommission };
  }, [selectedClasses, rateOverrides]);

  // Dashboard summary cards
  const dashboard = useMemo(() => {
    const allBilled = classes.reduce((s, c) => s + Number(c.gross_amount), 0);
    const allCommission = classes.reduce((s, c) => s + Number(c.commission_amount), 0);
    const unliquidated = classes.filter((c) => c.settlement_status === 'pendiente').reduce((s, c) => s + Number(c.commission_amount), 0);
    const pendingPayments = settlements
      .filter((s) => s.status !== 'pagada')
      .reduce((sum, s) => sum + (Number(s.total_commission) - Number(s.total_paid)), 0);
    return { allBilled, allCommission, unliquidated, pendingPayments };
  }, [classes, settlements]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === pendienteClasses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendienteClasses.map((c) => c.id)));
    }
  };

  const getRate = (c: ProfessorClass) => rateOverrides[c.id] ?? Number(c.commission_rate);
  const getCommissionAmount = (c: ProfessorClass) => Number(c.collected_amount) * getRate(c) / 100;

  const setRate = (id: string, rate: number) => {
    setRateOverrides((prev) => ({ ...prev, [id]: rate }));
  };

  const handleGenerate = async () => {
    if (selectedClasses.length === 0) return alert('Seleccioná al menos una clase.');
    const professorIds = new Set(selectedClasses.map((c) => c.professor_id));
    if (professorIds.size !== 1) return alert('Todas las clases seleccionadas deben ser del mismo profesor.');

    const professorId = selectedClasses[0].professor_id;
    const classIds = selectedClasses.map((c) => c.id);

    setGenerating(true);
    const { error: rpcError } = await supabase.rpc('generate_professor_settlement', {
      p_professor_id: professorId,
      p_period_from: fromDate,
      p_period_to: toDate,
      p_class_ids: classIds,
      p_user: userName,
    });
    setGenerating(false);
    if (rpcError) {
      console.error('Error generando liquidación:', rpcError);
      return alert('No se pudo generar la liquidación: ' + rpcError.message);
    }
    alert('Liquidación generada con éxito.');
    await loadClasses();
    await loadSettlements();
    setTab('historial');
  };

  const handlePayment = async () => {
    if (!payModal) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return setPayError('Ingresá un monto válido.');
    const balance = Number(payModal.total_commission) - Number(payModal.total_paid);
    if (amount > balance + 0.01) return setPayError(`El monto excede el saldo pendiente (${fmtPesos(balance)}).`);

    setPaySaving(true);
    const { error: rpcError } = await supabase.rpc('register_professor_payment', {
      p_settlement_id: payModal.id,
      p_amount: amount,
      p_payment_date: payDate,
      p_payment_method: payMethod,
      p_notes: payNotes,
      p_user: userName,
      p_shift_id: shiftId,
    });
    setPaySaving(false);
    if (rpcError) {
      console.error('Error registrando pago:', rpcError);
      return setPayError('No se pudo registrar el pago: ' + rpcError.message);
    }
    setPayModal(null);
    setPayAmount('');
    setPayNotes('');
    setPayError('');
    await loadSettlements();
  };

  const openPayModal = (s: ProfessorSettlement) => {
    setPayModal(s);
    const balance = Number(s.total_commission) - Number(s.total_paid);
    setPayAmount(balance.toFixed(2));
    setPayDate(todayISO());
    setPayMethod('efectivo');
    setPayNotes('');
    setPayError('');
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pendiente_pago: 'bg-amber-100 text-amber-700 border-amber-200',
      pagada_parcial: 'bg-sky-100 text-sky-700 border-sky-200',
      pagada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      anulada: 'bg-red-100 text-red-700 border-red-200',
    };
    const labels: Record<string, string> = {
      pendiente_pago: 'Pendiente de pago',
      pagada_parcial: 'Pago parcial',
      pagada: 'Pagada',
      anulada: 'Anulada',
    };
    return (
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${map[status] || 'bg-slate-100 text-slate-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const collectionBadge = (status: string) => {
    const map: Record<string, string> = {
      pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
      pagada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      anulada: 'bg-red-50 text-red-700 border-red-200',
    };
    const labels: Record<string, string> = { pendiente: 'Pend. cobro', pagada: 'Cobrada', anulada: 'Anulada' };
    return (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[status] || 'bg-slate-50 text-slate-500'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total facturado en clases" value={fmtPesos(dashboard.allBilled)} icon={DollarSign} color="from-emerald-500 to-teal-600" />
        <SummaryCard label="Total comisiones" value={fmtPesos(dashboard.allCommission)} icon={Percent} color="from-sky-500 to-blue-600" />
        <SummaryCard label="Comisiones sin liquidar" value={fmtPesos(dashboard.unliquidated)} icon={GraduationCap} color="from-amber-500 to-orange-600" />
        <SummaryCard label="Pagos pendientes" value={fmtPesos(dashboard.pendingPayments)} icon={Wallet} color="from-rose-500 to-red-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('liquidacion')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            tab === 'liquidacion' ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Liquidación
        </button>
        <button
          onClick={() => setTab('historial')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            tab === 'historial' ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Historial de Liquidaciones
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-md p-4 border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-700">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Desde</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Hasta</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Profesor</label>
            <select value={profFilter} onChange={(e) => setProfFilter(e.target.value)} className={inputClass}>
              <option value="all">Todos</option>
              {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {tab === 'liquidacion' && (
            <div>
              <label className={labelClass}>Estado</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                <option value="pendiente">Pendientes de liquidar</option>
                <option value="liquidada">Liquidadas</option>
                <option value="all">Todas</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-sky-500" size={32} />
        </div>
      )}

      {/* LIQUIDACION TAB */}
      {tab === 'liquidacion' && !loading && (
        <>
          {pendienteClasses.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold">
                    {selectedIds.size === pendienteClasses.length ? <CheckCircle2 size={18} /> : <div className="w-5 h-5 border-2 border-white rounded" />}
                    {selectedIds.size === pendienteClasses.length ? 'Quitar selección' : 'Seleccionar todas'}
                  </button>
                  <span className="text-sm text-white/80">({pendienteClasses.length} pendientes)</span>
                </div>
                {selectedClasses.length > 0 && (
                  <span className="text-sm font-bold">{selectedClasses.length} seleccionadas · {fmtPesos(summary.totalCommission)}</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Profesor</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Bruto</th>
                      <th className="px-3 py-2 text-right">Cobrado</th>
                      <th className="px-3 py-2 text-right">Comisión %</th>
                      <th className="px-3 py-2 text-right">Monto comisión</th>
                      <th className="px-3 py-2 text-center">Cobro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendienteClasses.map((c) => {
                      const isSelected = selectedIds.has(c.id);
                      return (
                        <tr key={c.id} className={isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'}>
                          <td className="px-3 py-2.5">
                            <button onClick={() => toggleSelect(c.id)} className="flex items-center justify-center">
                              {isSelected ? <CheckCircle2 size={18} className="text-sky-600" /> : <div className="w-5 h-5 border-2 border-slate-300 rounded hover:border-sky-400" />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{c.class_date}{c.class_time ? ` ${c.class_time}` : ''}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{c.professor_name}</td>
                          <td className="px-3 py-2.5 text-slate-600">{c.product_name}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700">${fmtPesos(c.gross_amount)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700">${fmtPesos(c.collected_amount)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={getRate(c)}
                              onChange={(e) => setRate(c.id, parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-sm border-2 border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-sky-500"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800">${fmtPesos(getCommissionAmount(c))}</td>
                          <td className="px-3 py-2.5 text-center">{collectionBadge(c.collection_status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary + generate */}
          {selectedClasses.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg border-2 border-sky-200 p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-semibold uppercase">Total bruto</p>
                  <p className="text-xl font-bold text-slate-800">${fmtPesos(summary.totalGross)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-semibold uppercase">Total cobrado</p>
                  <p className="text-xl font-bold text-slate-800">${fmtPesos(summary.totalCollected)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-sky-600 font-semibold uppercase">Total a pagar</p>
                  <p className="text-2xl font-bold text-sky-600">${fmtPesos(summary.totalCommission)}</p>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold shadow-lg transition-all disabled:bg-slate-300"
              >
                {generating ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                Generar Liquidación
              </button>
            </div>
          )}

          {pendienteClasses.length === 0 && liquidadaClasses.length === 0 && (
            <div className="text-center py-12">
              <GraduationCap className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-500">No hay clases en el período seleccionado.</p>
            </div>
          )}
        </>
      )}

      {/* HISTORIAL TAB */}
      {tab === 'historial' && !loading && (
        <div className="space-y-3">
          {settlements.length === 0 && (
            <div className="text-center py-12">
              <FileText className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-500">No hay liquidaciones registradas.</p>
            </div>
          )}
          {settlements.map((s) => {
            const balance = Number(s.total_commission) - Number(s.total_paid);
            const isExpanded = expanded.has(s.id);
            return (
              <div key={s.id} className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                    <div>
                      <p className="font-bold text-slate-800">Liquidación #{s.settlement_number}</p>
                      <p className="text-xs text-slate-500">{s.professor_name} · {s.period_from} a {s.period_to} · {s.item_count} clases</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {statusBadge(s.status)}
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Comisión</p>
                      <p className="font-bold text-slate-800">${fmtPesos(s.total_commission)}</p>
                    </div>
                    {balance > 0.01 && s.status !== 'anulada' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openPayModal(s); }}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm shadow transition-colors"
                      >
                        Registrar pago
                      </button>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-5 space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-slate-500">Total bruto</p>
                        <p className="font-bold text-slate-800">${fmtPesos(s.total_gross)}</p>
                      </div>
                      <div className="text-center bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-slate-500">Total comisión</p>
                        <p className="font-bold text-sky-600">${fmtPesos(s.total_commission)}</p>
                      </div>
                      <div className="text-center bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-slate-500">Total pagado</p>
                        <p className="font-bold text-emerald-600">${fmtPesos(s.total_paid)}</p>
                      </div>
                      <div className="text-center bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-slate-500">Saldo</p>
                        <p className={`font-bold ${balance > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>${fmtPesos(balance)}</p>
                      </div>
                    </div>

                    {s.payments.length > 0 && (
                      <div>
                        <p className="text-sm font-bold text-slate-700 mb-2">Pagos registrados</p>
                        <div className="space-y-2">
                          {s.payments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm">
                              <div className="flex items-center gap-3">
                                <Wallet size={16} className="text-emerald-600" />
                                <span className="font-semibold text-slate-700">${fmtPesos(p.amount)}</span>
                                <span className="text-xs text-slate-500">{p.payment_method}</span>
                                <span className="text-xs text-slate-400">{p.payment_date}</span>
                              </div>
                              {p.notes && <span className="text-xs text-slate-500">{p.notes}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-400">
                      Creada por {s.created_by} el {new Date(s.created_at).toLocaleString('es-AR')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PAYMENT MODAL */}
      {payModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Wallet size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Registrar Pago</h3>
              </div>
              <button onClick={() => setPayModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
                <p className="font-semibold text-slate-700">{payModal.professor_name} · Liquidación #{payModal.settlement_number}</p>
                <p className="text-slate-500">Comisión total: ${fmtPesos(payModal.total_commission)}</p>
                <p className="text-slate-500">Ya pagado: ${fmtPesos(payModal.total_paid)}</p>
                <p className="font-bold text-rose-600">Saldo pendiente: ${fmtPesos(Number(payModal.total_commission) - Number(payModal.total_paid))}</p>
              </div>

              <div>
                <label className={labelClass}>Monto del pago *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Fecha</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Método</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'efectivo' | 'transferencia')} className={inputClass}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Notas (opcional)</label>
                <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
              </div>

              {payError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{payError}</div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setPayModal(null)}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePayment}
                  disabled={paySaving}
                  className="flex-1 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-lg transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
                >
                  {paySaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Registrar Pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof DollarSign; color: string }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-xl shadow-lg p-4 text-white`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
          <Icon size={16} />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wide">{label}</h3>
      </div>
      <p className="text-xl font-bold">${value}</p>
    </div>
  );
}
