import { useState, useEffect } from 'react';
import { supabase, CustomerAccount, CurrentAccountTransaction, Sale, Shift, Configuration } from '../lib/supabase';
import {
  Search,
  BookOpen,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Printer,
  Download,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Receipt,
} from 'lucide-react';

interface CuentaCorrienteProps {
  shift: Shift | null;
}

export default function CuentaCorriente({ shift }: CuentaCorrienteProps) {
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [transactions, setTransactions] = useState<CurrentAccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<CustomerAccount | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAccount, setPaymentAccount] = useState<CustomerAccount | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => {
    loadData();
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase.from('configuration').select('*').maybeSingle();
    if (data) setConfig(data);
  };

  const loadData = async () => {
    setLoading(true);
    const [{ data: accountsData }, { data: txData }] = await Promise.all([
      supabase.from('customer_accounts').select('*').order('customer_name'),
      supabase.from('current_account_transactions').select('*').order('created_at', { ascending: false }),
    ]);
    setAccounts(accountsData || []);
    setTransactions(txData || []);
    setLoading(false);
  };

  const getAccountTransactions = (accountId: string) =>
    transactions.filter((t) => t.customer_account_id === accountId);

  const filteredAccounts = accounts.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.customer_name.toLowerCase().includes(q) ||
      a.customer_lot.toLowerCase().includes(q)
    );
  });

  const totalDebt = accounts.reduce((sum, a) => sum + Number(a.total_debt), 0);
  const debtors = accounts.filter((a) => Number(a.total_debt) > 0).length;

  const handleOpenPayment = (account: CustomerAccount) => {
    setPaymentAccount(account);
    setPaymentAmount(String(Number(account.total_debt).toFixed(2)));
    setPaymentMethod('efectivo');
    setShowPaymentModal(true);
  };

  const handleRegisterPayment = async () => {
    if (!paymentAccount || !shift) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return alert('Ingresá un monto válido.');
    if (amount > Number(paymentAccount.total_debt)) {
      return alert('El monto no puede superar la deuda actual.');
    }

    setPaymentLoading(true);

    const newBalance = Number(paymentAccount.total_debt) - amount;

    await supabase
      .from('customer_accounts')
      .update({ total_debt: newBalance, updated_at: new Date().toISOString() })
      .eq('id', paymentAccount.id);

    await supabase.from('current_account_transactions').insert([{
      customer_account_id: paymentAccount.id,
      customer_name: paymentAccount.customer_name,
      customer_lot: paymentAccount.customer_lot,
      type: 'pago',
      amount,
      balance_after: newBalance,
      payment_method: paymentMethod,
      description: `Pago de cuenta corriente`,
      user_name: shift.user_name,
      shift_id: shift.id,
    }]);

    await supabase.from('cash_transactions').insert([{
      shift_id: shift.id,
      type: 'income',
      category: 'cuenta_corriente',
      amount,
      payment_method: paymentMethod,
      description: `Pago cta. cte. - ${paymentAccount.customer_name} (Lote ${paymentAccount.customer_lot || '-'})`,
    }]);

    setShowPaymentModal(false);
    setPaymentAccount(null);
    setPaymentAmount('');
    await loadData();
    setPaymentLoading(false);
  };

  const handleViewInvoice = async (tx: CurrentAccountTransaction) => {
    if (!tx.sale_id) return;
    setInvoiceLoading(true);
    setInvoiceSale(null);
    const { data } = await supabase.from('sales').select('*').eq('id', tx.sale_id).maybeSingle();
    setInvoiceSale(data as Sale | null);
    setInvoiceLoading(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const arg = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    return arg.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const arg = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    return arg.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const exportToCSV = () => {
    const headers = ['Cliente', 'Lote', 'Fecha', 'Hora', 'Tipo', 'Monto', 'Saldo', 'Método', 'Descripción'];
    const rows = filteredAccounts.flatMap((account) => {
      const txs = getAccountTransactions(account.id);
      if (txs.length === 0) {
        return [[account.customer_name, account.customer_lot, '', '', 'Sin movimientos', '', Number(account.total_debt).toFixed(2), '', '']];
      }
      return txs.map((tx) => [
        account.customer_name,
        account.customer_lot,
        formatDate(tx.created_at),
        formatTime(tx.created_at),
        tx.type === 'cargo' ? 'Cargo' : 'Pago',
        Number(tx.amount).toFixed(2),
        Number(tx.balance_after).toFixed(2),
        tx.payment_method || '',
        tx.description,
      ]);
    });

    const csv = [headers, ...rows].map((r) =>
      r.map((v) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cuentas_corrientes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const printAccount = (account: CustomerAccount) => {
    const win = window.open('', '', 'height=600,width=600');
    if (!win) return;
    const txs = getAccountTransactions(account.id);
    win.document.write(`
      <html><head><title>Cuenta Corriente - ${account.customer_name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
        th { background: #f3f4f6; font-weight: bold; }
        .cargo { color: #dc2626; }
        .pago { color: #16a34a; }
        .summary { margin-top: 16px; font-size: 16px; font-weight: bold; }
      </style></head>
      <body>
      <h1>${config?.business_name || 'Kiosco'} - Cuenta Corriente</h1>
      <p><strong>Cliente:</strong> ${account.customer_name}</p>
      <p><strong>Lote:</strong> ${account.customer_lot || '-'}</p>
      <p><strong>Fecha de emisión:</strong> ${new Date().toLocaleString('es-AR')}</p>
      <table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Monto</th><th>Saldo</th><th>Detalle</th></tr></thead>
        <tbody>
          ${txs.map((tx) => `
            <tr>
              <td>${formatDate(tx.created_at)}</td>
              <td>${formatTime(tx.created_at)}</td>
              <td class="${tx.type}">${tx.type === 'cargo' ? 'Cargo' : 'Pago'}</td>
              <td class="${tx.type}">$${Number(tx.amount).toFixed(2)}</td>
              <td>$${Number(tx.balance_after).toFixed(2)}</td>
              <td>${tx.description}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="summary">Saldo actual: $${Number(account.total_debt).toFixed(2)}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const printAllDebts = () => {
    const win = window.open('', '', 'height=600,width=800');
    if (!win) return;
    const debtAccounts = filteredAccounts.filter((a) => Number(a.total_debt) > 0);
    win.document.write(`
      <html><head><title>Reporte Cuentas Corrientes</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f3f4f6; font-weight: bold; }
        .total { margin-top: 16px; font-size: 18px; font-weight: bold; }
      </style></head>
      <body>
      <h1>${config?.business_name || 'Kiosco'} - Resumen Cuentas Corrientes</h1>
      <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR')}</p>
      <table>
        <thead><tr><th>Cliente</th><th>Lote</th><th>Deuda</th></tr></thead>
        <tbody>
          ${debtAccounts.map((a) => `<tr><td>${a.customer_name}</td><td>${a.customer_lot || '-'}</td><td>$${Number(a.total_debt).toFixed(2)}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="total">Total deuda: $${debtAccounts.reduce((s, a) => s + Number(a.total_debt), 0).toFixed(2)}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-xl font-bold text-slate-800">Cuentas Corrientes</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl flex items-center gap-2 font-medium shadow transition-all"
          >
            <Download size={18} />
            Exportar CSV
          </button>
          <button
            onClick={printAllDebts}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-xl flex items-center gap-2 font-medium shadow transition-all"
          >
            <Printer size={18} />
            Imprimir Resumen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm">Total Deuda</p>
              <p className="text-3xl font-bold mt-1">${totalDebt.toFixed(2)}</p>
            </div>
            <DollarSign className="opacity-80" size={40} />
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Clientes con Deuda</p>
              <p className="text-3xl font-bold mt-1">{debtors}</p>
            </div>
            <AlertCircle className="opacity-80" size={40} />
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">Total Cuentas</p>
              <p className="text-3xl font-bold mt-1">{accounts.length}</p>
            </div>
            <BookOpen className="opacity-80" size={40} />
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o lote..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400 transition-all"
        />
      </div>

      <div className="space-y-3">
        {filteredAccounts.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            No hay cuentas corrientes registradas
          </div>
        )}

        {filteredAccounts.map((account) => {
          const debt = Number(account.total_debt);
          const isExpanded = expandedAccount === account.id;
          const accountTxs = getAccountTransactions(account.id);

          return (
            <div
              key={account.id}
              className={`bg-white rounded-xl shadow border-2 transition-all ${
                debt > 0 ? 'border-amber-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      debt > 0
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {debt > 0 ? <Clock size={20} /> : <CheckCircle size={20} />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{account.customer_name}</p>
                    <p className="text-sm text-slate-500">Lote: {account.customer_lot || '-'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Saldo</p>
                    <p
                      className={`text-xl font-bold ${
                        debt > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      ${debt.toFixed(2)}
                    </p>
                  </div>

                  {debt > 0 && (
                    <button
                      onClick={() => handleOpenPayment(account)}
                      className="px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-sm font-medium shadow transition-all"
                    >
                      Registrar Pago
                    </button>
                  )}

                  <button
                    onClick={() => printAccount(account)}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    title="Imprimir tarjeta"
                  >
                    <Printer size={18} />
                  </button>

                  <button
                    onClick={() =>
                      setExpandedAccount(isExpanded ? null : account.id)
                    }
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-200 p-4">
                  <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Clock size={16} />
                    Historial de movimientos
                  </h4>
                  {accountTxs.length === 0 ? (
                    <p className="text-slate-400 text-sm">Sin movimientos registrados</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Fecha</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Hora</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Tipo</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Monto</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Saldo</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Método</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {accountTxs.map((tx) => (
                            <tr
                              key={tx.id}
                              onClick={() => tx.sale_id && handleViewInvoice(tx)}
                              className={`transition-colors ${
                                tx.sale_id
                                  ? 'hover:bg-blue-50 cursor-pointer'
                                  : 'hover:bg-slate-50'
                              }`}
                              title={tx.sale_id ? 'Ver factura de esta venta' : undefined}
                            >
                              <td className="px-3 py-2 text-slate-600">{formatDate(tx.created_at)}</td>
                              <td className="px-3 py-2 text-slate-500">{formatTime(tx.created_at)}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                    tx.type === 'cargo'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}
                                >
                                  {tx.type === 'cargo' ? 'Cargo' : 'Pago'}
                                </span>
                              </td>
                              <td
                                className={`px-3 py-2 font-semibold ${
                                  tx.type === 'cargo' ? 'text-red-600' : 'text-emerald-600'
                                }`}
                              >
                                {tx.type === 'cargo' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-slate-700 font-medium">
                                ${Number(tx.balance_after).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-slate-500 capitalize">
                                {tx.payment_method || '-'}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                <span className="flex items-center gap-1.5">
                                  {tx.description}
                                  {tx.sale_id && (
                                    <Receipt size={14} className="text-blue-400 flex-shrink-0" />
                                  )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(invoiceSale || invoiceLoading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Receipt size={20} className="text-blue-500" />
                Detalle de Venta
              </h3>
              <button
                onClick={() => { setInvoiceSale(null); setInvoiceLoading(false); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {invoiceLoading ? (
                <div className="text-center py-8 text-slate-500">Cargando factura...</div>
              ) : !invoiceSale ? (
                <div className="text-center py-8 text-slate-400">No se encontró la venta.</div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Numero de venta</span>
                      <span className="font-semibold text-slate-700">{invoiceSale.sale_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Fecha</span>
                      <span className="font-semibold text-slate-700">{formatDate(invoiceSale.created_at)} {formatTime(invoiceSale.created_at)}</span>
                    </div>
                    {invoiceSale.customer_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Cliente</span>
                        <span className="font-semibold text-slate-700">{invoiceSale.customer_name}</span>
                      </div>
                    )}
                    {invoiceSale.customer_lot && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Lote</span>
                        <span className="font-semibold text-slate-700">{invoiceSale.customer_lot}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Vendedor</span>
                      <span className="font-semibold text-slate-700">{invoiceSale.user_name}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Productos</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Producto</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase">Cant.</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Precio</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(invoiceSale.items || []).map((item, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-700">{item.product_name}</td>
                              <td className="px-3 py-2 text-center text-slate-600">{item.quantity}</td>
                              <td className="px-3 py-2 text-right text-slate-600">${Number(item.price).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-800">${Number(item.subtotal).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="text-slate-700">${Number(invoiceSale.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(invoiceSale.discount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Descuento</span>
                        <span className="text-red-600">-${Number(invoiceSale.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-1">
                      <span className="text-slate-700">Total</span>
                      <span className="text-slate-900">${Number(invoiceSale.total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && paymentAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-slate-800">Registrar Pago</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-slate-600">Cliente</p>
                <p className="font-bold text-slate-800 text-lg">{paymentAccount.customer_name}</p>
                <p className="text-sm text-slate-500">Lote: {paymentAccount.customer_lot || '-'}</p>
                <div className="mt-2 pt-2 border-t border-amber-200">
                  <p className="text-sm text-slate-600">Deuda actual</p>
                  <p className="text-2xl font-bold text-amber-600">
                    ${Number(paymentAccount.total_debt).toFixed(2)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Monto a pagar
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Number(paymentAccount.total_debt)}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400 text-lg font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Método de pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-400"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="qr">QR</option>
                  <option value="expensas">Expensas</option>
                </select>
              </div>

              {paymentAmount && parseFloat(paymentAmount) > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
                  <span className="text-sm text-slate-600">Saldo después del pago</span>
                  <span className="font-bold text-lg text-emerald-600">
                    ${Math.max(0, Number(paymentAccount.total_debt) - parseFloat(paymentAmount)).toFixed(2)}
                  </span>
                </div>
              )}

              <button
                onClick={handleRegisterPayment}
                disabled={paymentLoading || !paymentAmount || parseFloat(paymentAmount) <= 0}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-400 text-white py-3 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle size={22} />
                {paymentLoading ? 'Registrando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
