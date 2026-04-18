import { useState, useEffect, useMemo } from 'react';
import { supabase, Shift, CashTransaction, Sale } from '../lib/supabase';
import { Wallet, Plus, DollarSign, TrendingUp, TrendingDown, LogOut, Clock, Calendar, Download, X, Filter, ShoppingCart, Table, Share2, Printer } from 'lucide-react';

interface CajaProps {
  shift: Shift | null;
  onCloseShift: (closingCash: number) => void;
}

export default function Caja({ shift, onCloseShift }: CajaProps) {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<CashTransaction | null>(null);
  const [saleDetails, setSaleDetails] = useState<Sale | null>(null);
  const [closingCash, setClosingCash] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [showResumenDiario, setShowResumenDiario] = useState(false);
  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    category: '',
    amount: '',
    payment_method: 'efectivo',
    description: ''
  });

  useEffect(() => {
    if (shift) {
      loadTransactions();
    }
  }, [shift, dateFilter, customDateFrom, customDateTo]);

  const loadTransactions = async () => {
    if (!shift) return;

    let query = supabase
      .from('cash_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFilter === 'shift') {
      query = query.eq('shift_id', shift.id);
    } else if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('created_at', today.toISOString());
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      query = query.gte('created_at', monthAgo.toISOString());
    } else if (dateFilter === 'currentMonth') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      firstDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', firstDay.toISOString());
    } else if (dateFilter === 'previousMonth') {
      const now = new Date();
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      firstDayPrevMonth.setHours(0, 0, 0, 0);
      lastDayPrevMonth.setHours(23, 59, 59, 999);
      query = query
        .gte('created_at', firstDayPrevMonth.toISOString())
        .lte('created_at', lastDayPrevMonth.toISOString());
    } else if (dateFilter === 'custom' && customDateFrom && customDateTo) {
      const fromDate = new Date(customDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(customDateTo);
      toDate.setHours(23, 59, 59, 999);

      query = query
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString());
    }

    const { data } = await query;
    setTransactions(data || []);
  };

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    const argDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

    const dateStr = argDate.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const timeStr = argDate.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return `${dateStr}, ${timeStr}`;
  };

  const loadSaleDetails = async (saleNumber: string) => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('sale_number', saleNumber)
      .maybeSingle();

    setSaleDetails(data);
  };

  const handleTransactionClick = async (transaction: CashTransaction) => {
    setSelectedTransaction(transaction);
    setSaleDetails(null);

    if (transaction.category.toLowerCase() === 'venta' && transaction.description) {
      const saleNumberMatch = transaction.description.match(/V-\d+/);
      if (saleNumberMatch) {
        await loadSaleDetails(saleNumberMatch[0]);
      }
    }

    setShowDetailModal(true);
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'Hora', 'Tipo', 'Categoría', 'Monto', 'Método de Pago', 'Descripción'];

    const rows = transactions.map(t => {
      const [date, time] = formatDateTime(t.created_at).split(' ');
      return [
        date,
        time,
        t.type === 'income' ? 'Ingreso' : 'Egreso',
        t.category,
        t.type === 'income' ? Number(t.amount).toFixed(2) : `-${Number(t.amount).toFixed(2)}`,
        t.payment_method,
        t.description || ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(value => {
          const v = String(value ?? '');
          if (v.includes(',') || v.includes('"') || v.includes('\n')) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `movimientos_caja_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;

    await supabase.from('cash_transactions').insert([{
      shift_id: shift.id,
      type: formData.type,
      category: formData.category,
      amount: parseFloat(formData.amount),
      payment_method: formData.payment_method,
      description: formData.description
    }]);

    loadTransactions();
    setShowModal(false);
    setFormData({ type: 'income', category: '', amount: '', payment_method: 'efectivo', description: '' });
  };

  const handleCloseShift = () => {
    setShowCloseModal(true);
  };

  const confirmCloseShift = () => {
    if (closingCash && parseFloat(closingCash) >= 0) {
      onCloseShift(parseFloat(closingCash));
      setShowCloseModal(false);
      setClosingCash('');
    }
  };

  // Totales generales
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  const openingCash = Number(shift?.opening_cash || 0);
  const expectedCash = openingCash + balance;

  // Saldos por método de pago

  // Efectivo: apertura + ingresos efectivo - egresos efectivo
  const incomeCash = transactions
    .filter(t => t.type === 'income' && t.payment_method === 'efectivo')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseCash = transactions
    .filter(t => t.type === 'expense' && t.payment_method === 'efectivo')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const cashInBox = openingCash + incomeCash - expenseCash;

  // Transferencias: ingresos - egresos
  const incomeTransfer = transactions
    .filter(t => t.type === 'income' && t.payment_method === 'transferencia')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseTransfer = transactions
    .filter(t => t.type === 'expense' && t.payment_method === 'transferencia')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const transferInBox = incomeTransfer - expenseTransfer;

  // QR: ingresos - egresos
  const incomeQr = transactions
    .filter(t => t.type === 'income' && t.payment_method === 'qr')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseQr = transactions
    .filter(t => t.type === 'expense' && t.payment_method === 'qr')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const qrInBox = incomeQr - expenseQr;

  // Expensas: ingresos - egresos
  const incomeExpensas = transactions
    .filter(t => t.type === 'income' && t.payment_method === 'expensas')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenseExpensas = transactions
    .filter(t => t.type === 'expense' && t.payment_method === 'expensas')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expensasInBox = incomeExpensas - expenseExpensas;

  // Cuenta Corriente: ventas a crédito - pagos recibidos
  const cuentaCorrienteDeuda = transactions
    .filter(t => t.type === 'income' && t.payment_method === 'cuenta_corriente')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const cuentaCorrientePagos = transactions
    .filter(t => t.type === 'income' && t.category === 'cuenta_corriente')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const cuentaCorrienteInBox = cuentaCorrienteDeuda - cuentaCorrientePagos;

  const formatDateOnly = (iso: string) => {
    const d = new Date(iso);
    const argDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    return argDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  type DaySummary = {
    date: string;
    ingresoEfectivo: number;
    ingresoTransferencia: number;
    ingresoQr: number;
    egresoEfectivo: number;
    egresoTransferencia: number;
    egresoQr: number;
    totalDiario: number;
  };

  const dailySummary: DaySummary[] = useMemo(() => {
    const map = new Map<string, Omit<DaySummary, 'date'>>();

    const empty = (): Omit<DaySummary, 'date'> => ({
      ingresoEfectivo: 0,
      ingresoTransferencia: 0,
      ingresoQr: 0,
      egresoEfectivo: 0,
      egresoTransferencia: 0,
      egresoQr: 0,
      totalDiario: 0,
    });

    transactions.forEach((t) => {
      const date = formatDateOnly(t.created_at);
      const prev = map.get(date) || empty();
      const amount = Number(t.amount) || 0;
      const method = (t.payment_method || '').toLowerCase();

      if (t.type === 'income') {
        if (method === 'efectivo') prev.ingresoEfectivo += amount;
        else if (method === 'transferencia') prev.ingresoTransferencia += amount;
        else if (method === 'qr') prev.ingresoQr += amount;
        prev.totalDiario += amount;
      } else {
        if (method === 'efectivo') prev.egresoEfectivo += amount;
        else if (method === 'transferencia') prev.egresoTransferencia += amount;
        else if (method === 'qr') prev.egresoQr += amount;
        prev.totalDiario -= amount;
      }

      map.set(date, prev);
    });

    const rows: DaySummary[] = Array.from(map.entries()).map(([date, totals]) => ({ date, ...totals }));
    rows.sort((a, b) => {
      const [ad, am, ay] = a.date.split('/').map(Number);
      const [bd, bm, by] = b.date.split('/').map(Number);
      return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
    });
    return rows;
  }, [transactions]);

  const dailySummaryTotals = useMemo(() => {
    return dailySummary.reduce(
      (acc, r) => {
        acc.ingresoEfectivo += r.ingresoEfectivo;
        acc.ingresoTransferencia += r.ingresoTransferencia;
        acc.ingresoQr += r.ingresoQr;
        acc.egresoEfectivo += r.egresoEfectivo;
        acc.egresoTransferencia += r.egresoTransferencia;
        acc.egresoQr += r.egresoQr;
        acc.totalDiario += r.totalDiario;
        return acc;
      },
      { ingresoEfectivo: 0, ingresoTransferencia: 0, ingresoQr: 0, egresoEfectivo: 0, egresoTransferencia: 0, egresoQr: 0, totalDiario: 0 }
    );
  }, [dailySummary]);

  const exportResumenCSV = () => {
    const fmt = (n: number) => n.toFixed(2).replace('.', ',');
    const headers = ['Fecha', 'Ing. Efectivo', 'Ing. Transferencia', 'Ing. QR', 'Egr. Efectivo', 'Egr. Transferencia', 'Egr. QR', 'Total Diario'];

    const dataRows = dailySummary.map((r) => [
      r.date,
      fmt(r.ingresoEfectivo),
      fmt(r.ingresoTransferencia),
      fmt(r.ingresoQr),
      fmt(-r.egresoEfectivo),
      fmt(-r.egresoTransferencia),
      fmt(-r.egresoQr),
      fmt(r.totalDiario),
    ]);

    dataRows.push([
      'TOTAL',
      fmt(dailySummaryTotals.ingresoEfectivo),
      fmt(dailySummaryTotals.ingresoTransferencia),
      fmt(dailySummaryTotals.ingresoQr),
      fmt(-dailySummaryTotals.egresoEfectivo),
      fmt(-dailySummaryTotals.egresoTransferencia),
      fmt(-dailySummaryTotals.egresoQr),
      fmt(dailySummaryTotals.totalDiario),
    ]);

    const csv = [headers.join(','), ...dataRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `resumen_diario_caja_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const shareResumenDiario = async () => {
    const fmt = (n: number) => n.toFixed(2);
    const lines = [
      'Resumen Diario de Caja',
      '',
      'Fecha | Ing.Efvo | Ing.Transf | Ing.QR | Egr.Efvo | Egr.Transf | Egr.QR | Total',
      ...dailySummary.map(
        (r) =>
          `${r.date} | ${fmt(r.ingresoEfectivo)} | ${fmt(r.ingresoTransferencia)} | ${fmt(r.ingresoQr)} | -${fmt(r.egresoEfectivo)} | -${fmt(r.egresoTransferencia)} | -${fmt(r.egresoQr)} | ${fmt(r.totalDiario)}`
      ),
      `TOTAL | ${fmt(dailySummaryTotals.ingresoEfectivo)} | ${fmt(dailySummaryTotals.ingresoTransferencia)} | ${fmt(dailySummaryTotals.ingresoQr)} | -${fmt(dailySummaryTotals.egresoEfectivo)} | -${fmt(dailySummaryTotals.egresoTransferencia)} | -${fmt(dailySummaryTotals.egresoQr)} | ${fmt(dailySummaryTotals.totalDiario)}`,
    ];
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Resumen Diario Caja', text });
      } else {
        await navigator.clipboard.writeText(text);
        alert('Resumen copiado al portapapeles');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const printResumenDiario = () => {
    const w = window.open('', '', 'height=650,width=980');
    if (!w) return;
    const fmt = (n: number) => `$${n.toFixed(2)}`;

    const rowsHtml = dailySummary
      .map(
        (r) => `<tr>
          <td>${r.date}</td>
          <td>${fmt(r.ingresoEfectivo)}</td>
          <td>${fmt(r.ingresoTransferencia)}</td>
          <td>${fmt(r.ingresoQr)}</td>
          <td class="egr">${r.egresoEfectivo > 0 ? `-${fmt(r.egresoEfectivo)}` : fmt(0)}</td>
          <td class="egr">${r.egresoTransferencia > 0 ? `-${fmt(r.egresoTransferencia)}` : fmt(0)}</td>
          <td class="egr">${r.egresoQr > 0 ? `-${fmt(r.egresoQr)}` : fmt(0)}</td>
          <td class="total">${fmt(r.totalDiario)}</td>
        </tr>`
      )
      .join('');

    w.document.write(`<html><head><title>Resumen Diario Caja</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px}
        h1{text-align:center;color:#111827;margin-bottom:4px}
        p{text-align:center;color:#6b7280;margin-top:0}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #e5e7eb;padding:8px;font-size:13px}
        th{background:#f3f4f6;text-align:left}
        td{text-align:right}
        td:first-child{text-align:left}
        .egr{color:#dc2626}
        .total{font-weight:bold}
        tr.totals td{background:#fef9c3;font-weight:bold}
      </style></head><body>
      <h1>Resumen Diario de Caja</h1>
      <table><thead><tr>
        <th>Fecha</th><th>Ing. Efectivo</th><th>Ing. Transferencia</th><th>Ing. QR</th>
        <th>Egr. Efectivo</th><th>Egr. Transferencia</th><th>Egr. QR</th><th>Total Diario</th>
      </tr></thead><tbody>
        ${rowsHtml}
        <tr class="totals">
          <td>TOTAL</td>
          <td>${fmt(dailySummaryTotals.ingresoEfectivo)}</td>
          <td>${fmt(dailySummaryTotals.ingresoTransferencia)}</td>
          <td>${fmt(dailySummaryTotals.ingresoQr)}</td>
          <td class="egr">${dailySummaryTotals.egresoEfectivo > 0 ? `-${fmt(dailySummaryTotals.egresoEfectivo)}` : fmt(0)}</td>
          <td class="egr">${dailySummaryTotals.egresoTransferencia > 0 ? `-${fmt(dailySummaryTotals.egresoTransferencia)}` : fmt(0)}</td>
          <td class="egr">${dailySummaryTotals.egresoQr > 0 ? `-${fmt(dailySummaryTotals.egresoQr)}` : fmt(0)}</td>
          <td class="total">${fmt(dailySummaryTotals.totalDiario)}</td>
        </tr>
      </tbody></table></body></html>`);
    w.document.close();
    w.print();
  };

  if (!shift) {
    return (
      <div className="text-center py-12">
        <Wallet className="mx-auto text-slate-400 mb-4" size={64} />
        <h3 className="text-xl font-bold text-slate-700">No hay turno activo</h3>
        <p className="text-slate-500">Inicia un turno para gestionar la caja</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header turno activo */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-900 rounded-xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Turno Activo</h3>
            <div className="flex items-center gap-4 text-slate-200">
              <span className="flex items-center gap-2">
                <Calendar size={16} />
                {formatDateTime(shift.start_date).split(' ')[0]}
              </span>
              <span className="flex items-center gap-2">
                <Clock size={16} />
                {formatDateTime(shift.start_date).split(' ')[1]}
              </span>
            </div>
            <p className="text-lg">
              <span className="text-slate-300">Usuario:</span> <strong>{shift.user_name}</strong>
            </p>
            <p className="text-lg">
              <span className="text-slate-300">Efectivo Inicial:</span>{' '}
              <strong>${Number(shift.opening_cash).toFixed(2)}</strong>
            </p>
          </div>
          <button
            onClick={handleCloseShift}
            className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-semibold shadow-lg transition-all"
          >
            <LogOut size={20} />
            Cerrar Turno
          </button>
        </div>
      </div>

      {/* Resumen Ingresos/Egresos/Balance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-emerald-100">Ingresos</span>
            <TrendingUp size={24} />
          </div>
          <p className="text-3xl font-bold">${totalIncome.toFixed(2)}</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-pink-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-100">Egresos</span>
            <TrendingDown size={24} />
          </div>
          <p className="text-3xl font-bold">${totalExpense.toFixed(2)}</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-100">Balance</span>
            <DollarSign size={24} />
          </div>
          <p className="text-3xl font-bold">${balance.toFixed(2)}</p>
        </div>
      </div>

      {/* Saldos por método de pago */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
          <p className="text-sm font-semibold text-slate-600">Caja Efectivo</p>
          <p className="text-2xl font-bold text-emerald-600">${cashInBox.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">
            Inicial + ingresos - egresos en efectivo
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
          <p className="text-sm font-semibold text-slate-600">Transferencias</p>
          <p className="text-2xl font-bold text-slate-800">${transferInBox.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Ingresos - egresos por transferencia</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
          <p className="text-sm font-semibold text-slate-600">QR</p>
          <p className="text-2xl font-bold text-slate-800">${qrInBox.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Ingresos - egresos por QR</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow border border-slate-200">
          <p className="text-sm font-semibold text-slate-600">Expensas</p>
          <p className="text-2xl font-bold text-slate-800">${expensasInBox.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Ingresos - egresos por expensas</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow border border-amber-200">
          <p className="text-sm font-semibold text-amber-700">Cta. Corriente</p>
          <p className="text-2xl font-bold text-amber-600">${cuentaCorrienteInBox.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">Ventas a crédito - pagos recibidos</p>
        </div>
      </div>

      {/* Título tabla movimientos + Filtros */}
      <div className="space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <h3 className="text-xl font-bold text-slate-800">Movimientos de Caja</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowResumenDiario(true)}
              className="bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all"
            >
              <Table size={18} />
              Resumen Diario
            </button>
            <button
              onClick={exportToCSV}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all"
            >
              <Download size={18} />
              Exportar
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all"
            >
              <Plus size={20} />
              Nuevo Movimiento
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={20} className="text-slate-600" />
            <button
              onClick={() => setDateFilter('shift')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'shift'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Solo este turno
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'today'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setDateFilter('week')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'week'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Última Semana
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'month'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Último Mes
            </button>
            <button
              onClick={() => setDateFilter('currentMonth')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'currentMonth'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Mes en curso
            </button>
            <button
              onClick={() => setDateFilter('previousMonth')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'previousMonth'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Mes anterior
            </button>
            <button
              onClick={() => setDateFilter('custom')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'custom'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Rango Personalizado
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === 'all'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Todos
            </button>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-purple-500"
                placeholder="Desde"
              />
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-purple-500"
                placeholder="Hasta"
              />
            </div>
          )}

          <span className="text-sm text-slate-600">
            {transactions.length} movimiento{transactions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Categoría
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Monto
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Método
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Descripción
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.id}
                className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleTransactionClick(t)}
              >
                <td className="px-6 py-4 text-sm text-slate-700">
                  {formatDateTime(t.created_at)}
                </td>
                <td className="px-6 py-4">
                  {t.type === 'income' ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">
                      <TrendingUp size={14} />
                      Ingreso
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-medium">
                      <TrendingDown size={14} />
                      Egreso
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-700">{t.category}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-800">
                  ${Number(t.amount).toFixed(2)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-700">{t.payment_method}</td>
                <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo movimiento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">Nuevo Movimiento</h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tipo *
                </label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="income">Ingreso</option>
                  <option value="expense">Egreso</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Categoría *
                </label>
                <input
                  type="text"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Monto *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Método de Pago *
                </label>
                <select
                  required
                  value={formData.payment_method}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_method: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="qr">QR</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="expensas">Expensas</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-700 shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal detalle de transacción */}
      {showDetailModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 rounded-t-2xl flex items-center justify-between sticky top-0">
              <h3 className="text-2xl font-bold text-white">
                Detalle de Transacción
              </h3>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedTransaction(null);
                  setSaleDetails(null);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {saleDetails ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Fecha</p>
                      <p className="text-lg font-bold text-slate-900">
                        {formatDateTime(selectedTransaction.created_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-600 mb-1">Usuario</p>
                      <p className="text-lg font-bold text-slate-900">{saleDetails.user_name}</p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-600 mb-1">Método de Pago</p>
                      <p className="text-lg font-bold text-slate-900 capitalize">
                        {selectedTransaction.payment_method}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-600 mb-1">Cliente</p>
                      <p className="text-lg font-bold text-slate-900">
                        {saleDetails.customer_name || '-'}
                      </p>
                    </div>
                  </div>

                  {saleDetails.customer_lot && (
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Lote</p>
                      <p className="text-lg font-bold text-slate-900">{saleDetails.customer_lot}</p>
                    </div>
                  )}

                  {saleDetails.payments && saleDetails.payments.length > 1 && (
                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="text-base font-bold text-slate-800 mb-3">Desglose de Pagos</h4>
                      <div className="space-y-2">
                        {saleDetails.payments.map((payment, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="text-slate-700 capitalize">{payment.method}:</span>
                            <span className="text-lg font-bold text-slate-900">
                              ${Number(payment.amount).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {saleDetails.items && saleDetails.items.length > 0 && (
                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="text-base font-bold text-slate-800 mb-3">Items</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                                Producto
                              </th>
                              <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                                Cant.
                              </th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                                Precio
                              </th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                                Subtotal
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {saleDetails.items.map((item, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-3 text-sm text-slate-900">
                                  {item.product_name}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-900 text-center">
                                  {item.quantity}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-900 text-right">
                                  ${Number(item.price).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">
                                  ${Number(item.subtotal).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="border-t-2 border-slate-300 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold text-slate-800">Total:</span>
                      <span className="text-3xl font-bold text-slate-900">
                        ${Number(saleDetails.total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-semibold text-slate-600 mb-2">Tipo</p>
                      {selectedTransaction.type === 'income' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full text-sm font-medium">
                          <TrendingUp size={16} />
                          Ingreso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-sm font-medium">
                          <TrendingDown size={16} />
                          Egreso
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-600 mb-2">Fecha y Hora</p>
                      <p className="font-bold text-slate-900 text-lg">
                        {formatDateTime(selectedTransaction.created_at)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Categoría</p>
                    <p className="text-base text-slate-900">{selectedTransaction.category}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Método de Pago</p>
                    <p className="text-base text-slate-900 capitalize">{selectedTransaction.payment_method}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Monto Total</p>
                    <p className="text-4xl font-bold text-slate-900">
                      ${Number(selectedTransaction.amount).toFixed(2)}
                    </p>
                  </div>

                  {selectedTransaction.description && (
                    <div>
                      <p className="text-sm font-semibold text-slate-600 mb-2">Descripción</p>
                      <p className="text-base text-slate-900">
                        {selectedTransaction.description}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showResumenDiario && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-xl font-bold text-slate-800">Resumen Diario de Caja</h3>
              <button onClick={() => setShowResumenDiario(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={printResumenDiario}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
                >
                  <Printer size={18} />
                  Imprimir
                </button>
                <button
                  onClick={shareResumenDiario}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center gap-2"
                >
                  <Share2 size={18} />
                  Compartir
                </button>
                <button
                  onClick={exportResumenCSV}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2"
                >
                  <Download size={18} />
                  Exportar CSV
                </button>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Fecha</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-emerald-700 uppercase">Ing. Efectivo</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-emerald-700 uppercase">Ing. Transferencia</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-emerald-700 uppercase">Ing. QR</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-red-700 uppercase">Egr. Efectivo</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-red-700 uppercase">Egr. Transferencia</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-red-700 uppercase">Egr. QR</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-800 uppercase">Total Diario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dailySummary.map((r) => (
                      <tr key={r.date} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm text-slate-800 font-medium">{r.date}</td>
                        <td className="px-4 py-2 text-sm text-right text-emerald-700">${r.ingresoEfectivo.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-right text-emerald-700">${r.ingresoTransferencia.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-right text-emerald-700">${r.ingresoQr.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-right text-red-600">
                          {r.egresoEfectivo > 0 ? `-$${r.egresoEfectivo.toFixed(2)}` : '$0.00'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-red-600">
                          {r.egresoTransferencia > 0 ? `-$${r.egresoTransferencia.toFixed(2)}` : '$0.00'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-red-600">
                          {r.egresoQr > 0 ? `-$${r.egresoQr.toFixed(2)}` : '$0.00'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-bold">
                          <span className={r.totalDiario >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                            ${r.totalDiario.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-yellow-50">
                      <td className="px-4 py-2 text-sm font-bold">TOTAL</td>
                      <td className="px-4 py-2 text-sm text-right font-bold text-emerald-700">${dailySummaryTotals.ingresoEfectivo.toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-bold text-emerald-700">${dailySummaryTotals.ingresoTransferencia.toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-bold text-emerald-700">${dailySummaryTotals.ingresoQr.toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-bold text-red-600">
                        {dailySummaryTotals.egresoEfectivo > 0 ? `-$${dailySummaryTotals.egresoEfectivo.toFixed(2)}` : '$0.00'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-bold text-red-600">
                        {dailySummaryTotals.egresoTransferencia > 0 ? `-$${dailySummaryTotals.egresoTransferencia.toFixed(2)}` : '$0.00'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-bold text-red-600">
                        {dailySummaryTotals.egresoQr > 0 ? `-$${dailySummaryTotals.egresoQr.toFixed(2)}` : '$0.00'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-bold">
                        <span className={dailySummaryTotals.totalDiario >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          ${dailySummaryTotals.totalDiario.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {dailySummary.length === 0 && (
                  <div className="text-center py-8 text-slate-500">No hay datos para el resumen con los filtros aplicados</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cierre de turno */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-red-500 to-pink-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">Cerrar Turno</h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Usuario:</span>
                  <span className="text-slate-900">{shift.user_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Hora Inicio:</span>
                  <span className="text-slate-900">
                    {formatDateTime(shift.start_date)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Efectivo Inicial:</span>
                  <span className="text-slate-900">
                    ${Number(shift.opening_cash).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                  <span className="font-semibold text-slate-700">Balance del Turno:</span>
                  <span
                    className={`font-bold ${
                      balance >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    ${balance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Efectivo Esperado:</span>
                  <span className="text-lg font-bold text-blue-600">
                    ${expectedCash.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Efectivo Final en Caja *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                    $
                  </span>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 text-lg font-semibold"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Cuenta todo el efectivo físico que hay en la caja
                </p>
              </div>

              {closingCash && (
                <div
                  className={`p-4 rounded-xl ${
                    Math.abs(parseFloat(closingCash) - expectedCash) < 0.01
                      ? 'bg-emerald-50 border-2 border-emerald-200'
                      : parseFloat(closingCash) > expectedCash
                      ? 'bg-blue-50 border-2 border-blue-200'
                      : 'bg-amber-50 border-2 border-amber-200'
                  }`}
                >
                  <p className="font-semibold text-sm">
                    {Math.abs(parseFloat(closingCash) - expectedCash) < 0.01 ? (
                      <span className="text-emerald-700">
                        ✓ La caja cuadra perfectamente
                      </span>
                    ) : parseFloat(closingCash) > expectedCash ? (
                      <span className="text-blue-700">
                        Hay ${(parseFloat(closingCash) - expectedCash).toFixed(2)} de más
                      </span>
                    ) : (
                      <span className="text-amber-700">
                        Faltan ${(expectedCash - parseFloat(closingCash)).toFixed(2)}
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCloseModal(false);
                    setClosingCash('');
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCloseShift}
                  disabled={!closingCash}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-pink-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cerrar Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
