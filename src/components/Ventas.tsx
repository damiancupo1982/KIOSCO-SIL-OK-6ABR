import { useState, useEffect } from 'react';
import { supabase, Product, SaleItem, Shift, CashTransaction } from '../lib/supabase';
import { Search, Minus, Plus, Trash2, ShoppingCart, CreditCard, AlertTriangle, Wallet, Banknote, ArrowRightLeft, QrCode, Building2 } from 'lucide-react';
import { EMPTY_PAYMENTS, LOTE_INCORRECTO_MSG, PaymentAmounts, isInvalidCcLot, preparePayments, processSale } from '../lib/processSale';
import PaymentFields from './PaymentFields';

interface VentasProps {
  shift: Shift | null;
}

export default function Ventas({ shift }: VentasProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<string>('todas');

  const [customerName, setCustomerName] = useState('');
  const [customerLot, setCustomerLot] = useState('');

  const [amounts, setAmounts] = useState<PaymentAmounts>(EMPTY_PAYMENTS);
  const cuentaCorrienteAmount = amounts.cuenta_corriente;

  const [monthlyBalances, setMonthlyBalances] = useState({ cash: 0, transfer: 0, qr: 0, expensas: 0, cuentaCorriente: 0 });
  const [showOldDebtWarning, setShowOldDebtWarning] = useState(false);
  const [oldDebtClients, setOldDebtClients] = useState<{ name: string; lot: string; debt: number; days: number }[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    loadMonthlyBalances();
  }, []);

  const total = cart.reduce((sum, i) => sum + i.subtotal, 0);

  useEffect(() => {
    const sum = Object.values(amounts).reduce((a, b) => a + b, 0);

    if (total > 0 && sum === 0) {
      setAmounts({ ...EMPTY_PAYMENTS, efectivo: total });
    }

    if (total === 0 && sum !== 0) {
      setAmounts(EMPTY_PAYMENTS);
    }
  }, [total]);

  const loadMonthlyBalances = async () => {
    const now = new Date();
    const ARG_OFFSET = 3;
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, ARG_OFFSET, 0, 0, 0)).toISOString();
    const { data } = await supabase
      .from('cash_transactions')
      .select('*')
      .gte('created_at', startOfMonth);
    const txs = (data || []) as CashTransaction[];
    const calc = (method: string) => {
      const inc = txs.filter(t => t.type === 'income' && t.payment_method === method).reduce((s, t) => s + Number(t.amount), 0);
      const exp = txs.filter(t => t.type === 'expense' && t.payment_method === method).reduce((s, t) => s + Number(t.amount), 0);
      return inc - exp;
    };
    const ccDeuda = txs.filter(t => t.type === 'income' && t.payment_method === 'cuenta_corriente').reduce((s, t) => s + Number(t.amount), 0);
    const ccPagos = txs.filter(t => t.type === 'income' && t.category === 'cuenta_corriente').reduce((s, t) => s + Number(t.amount), 0);
    setMonthlyBalances({
      cash: calc('efectivo'),
      transfer: calc('transferencia'),
      qr: calc('qr'),
      expensas: calc('expensas'),
      cuentaCorriente: ccDeuda - ccPagos,
    });
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .gt('stock', 0);

    setProducts(data || []);
  };

  const checkOldDebts = async () => {
    const [{ data: accountsData }, { data: txData }] = await Promise.all([
      supabase.from('customer_accounts').select('*').gt('total_debt', 0),
      supabase.from('current_account_transactions').select('*').eq('type', 'cargo'),
    ]);
    const oldDebts: { name: string; lot: string; debt: number; days: number }[] = [];
    for (const acct of accountsData || []) {
      const acctTxs = (txData || []).filter((t: any) => t.customer_account_id === acct.id);
      if (acctTxs.length > 0) {
        const oldest = acctTxs.reduce((o: any, t: any) =>
          new Date(t.created_at) < new Date(o.created_at) ? t : o
        );
        const daysOld = Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysOld > 30) {
          oldDebts.push({ name: acct.customer_name, lot: acct.customer_lot, debt: Number(acct.total_debt), days: daysOld });
        }
      }
    }
    if (oldDebts.length > 0) {
      oldDebts.sort((a, b) => b.days - a.days);
      setOldDebtClients(oldDebts);
      setShowOldDebtWarning(true);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((i) => i.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        return alert('Stock insuficiente');
      }
      setCart(
        cart.map((i) =>
          i.product_id === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                subtotal: (i.quantity + 1) * i.price,
              }
            : i
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          price: product.price,
          subtotal: product.price,
        },
      ]);
    }
  };

  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) {
      return setCart(cart.filter((i) => i.product_id !== id));
    }
    setCart(
      cart.map((i) =>
        i.product_id === id
          ? { ...i, quantity: qty, subtotal: qty * i.price }
          : i
      )
    );
  };

  const updatePrice = (id: string, newPrice: number) => {
    if (newPrice < 0) return;
    setCart(
      cart.map((i) =>
        i.product_id === id
          ? { ...i, price: newPrice, subtotal: i.quantity * newPrice }
          : i
      )
    );
  };

  const handleCompleteSale = async () => {
    if (!cart.length || !shift) {
      return alert('Carrito vacío o sin turno activo');
    }

    const prepared = preparePayments(amounts, total, customerName, customerLot);
    if ('error' in prepared) {
      return alert(prepared.error);
    }

    const result = await processSale({
      shift,
      items: cart,
      payments: prepared.payments,
      customerName,
      customerLot,
    });
    if (!result.ok) {
      return alert(result.error);
    }

    alert('Venta completada');
    loadMonthlyBalances();

    setCart([]);
    setCustomerName('');
    setCustomerLot('');
    setAmounts(EMPTY_PAYMENTS);
    loadProducts();
    checkOldDebts();
  };

  const invalidCcLot = cuentaCorrienteAmount > 0 && isInvalidCcLot(customerLot);

  const baseCategories = ['Bebida', 'Comida', 'Artículos de Deporte'];
  const categories = Array.from(
    new Set([
      ...baseCategories,
      ...products
        .map((p) => p.category)
        .filter((c): c is string => !!c && c.trim() !== ''),
    ])
  );

  const filtered = products.filter((p) => {
    const matchesCategory =
      selectedCategory === 'todas' ||
      (p.category || '').toLowerCase() === selectedCategory.toLowerCase();

    const matchesSearch = p.name
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return (
    <>
      {showOldDebtWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
            <div className="bg-red-50 border-b border-red-100 rounded-t-2xl p-5 flex items-start gap-4">
              <div className="bg-red-100 p-3 rounded-full flex-shrink-0">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-800">Deudas Antiguas Detectadas</h3>
                <p className="text-sm text-red-600 mt-1">
                  Los siguientes clientes tienen deuda de mas de 30 dias. Llamar para cobrar.
                </p>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <div className="space-y-2">
                {oldDebtClients.map((client, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                    <div>
                      <p className="font-semibold text-slate-800">{client.name}</p>
                      <p className="text-xs text-slate-500">Lote: {client.lot}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600">${client.debt.toLocaleString('es-AR')}</p>
                      <p className="text-xs text-red-500">{client.days} dias</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-200 p-4">
              <button
                onClick={() => setShowOldDebtWarning(false)}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
      {[
        { label: 'Efectivo', value: monthlyBalances.cash, icon: Banknote, color: 'emerald' },
        { label: 'Transferencias', value: monthlyBalances.transfer, icon: ArrowRightLeft, color: 'blue' },
        { label: 'QR', value: monthlyBalances.qr, icon: QrCode, color: 'violet' },
        { label: 'Expensas', value: monthlyBalances.expensas, icon: Building2, color: 'slate' },
        { label: 'Cta. Corriente', value: monthlyBalances.cuentaCorriente, icon: Wallet, color: 'amber' },
      ].map(card => (
        <div key={card.label} className={`bg-white rounded-xl p-3 shadow border ${
          card.color === 'amber' ? 'border-amber-200' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <card.icon size={14} className={`text-${card.color}-500`} />
            <p className={`text-xs font-semibold ${
              card.color === 'amber' ? 'text-amber-700' : 'text-slate-600'
            }`}>{card.label}</p>
          </div>
          <p className={`text-lg font-bold ${
            card.value < 0 ? 'text-red-600' : card.color === 'emerald' ? 'text-emerald-600' : card.color === 'amber' ? 'text-amber-600' : 'text-slate-800'
          }`}>
            ${card.value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-400">Mes en curso</p>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Buscar productos por nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>

            <div className="flex items-center">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full md:w-56 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="todas">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto pr-2">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-gradient-to-br from-white via-slate-50 to-slate-100 border-2 border-slate-200 hover:border-emerald-500 rounded-xl p-3 text-left transition-all hover:shadow-xl hover:scale-105"
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight flex-1 pr-1">
                    {p.name}
                  </h3>
                  {p.category && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {p.category}
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-0.5">
                  ${p.price.toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-500">Stock: {p.stock}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gradient-to-br from-white via-slate-50 to-emerald-50 rounded-xl shadow-xl p-5 border-2 border-emerald-200">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="text-emerald-600" size={24} />
              <h3 className="text-lg font-bold text-slate-800">Carrito</h3>
            </div>

            <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.product_id}
                  className="bg-white rounded-lg p-3 border-2 border-slate-200 hover:border-emerald-300 transition-all"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-sm text-slate-800">
                      {item.product_name}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product_id, 0)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity - 1)
                        }
                        className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center transition-all"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center font-bold text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product_id, item.quantity + 1)
                        }
                        className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center transition-all"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-600">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) =>
                          updatePrice(
                            item.product_id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-20 px-2 py-1 text-sm border-2 border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <span className="font-bold text-emerald-600 text-base">
                      ${item.subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder={cuentaCorrienteAmount > 0 ? "Nombre del cliente (obligatorio)" : "Nombre del cliente"}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border-2 rounded-xl text-sm focus:ring-2 ${
                    cuentaCorrienteAmount > 0 && !customerName.trim()
                      ? 'border-red-400 focus:ring-red-400 animate-pulse'
                      : 'border-slate-200 focus:ring-emerald-500'
                  }`}
                />
                <input
                  type="text"
                  placeholder={cuentaCorrienteAmount > 0 ? "Lote (obligatorio)" : "Lote"}
                  value={customerLot}
                  onChange={(e) => setCustomerLot(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border-2 rounded-xl text-sm focus:ring-2 ${
                    cuentaCorrienteAmount > 0 && (!customerLot.trim() || invalidCcLot)
                      ? 'border-red-400 focus:ring-red-400 animate-pulse'
                      : 'border-slate-200 focus:ring-emerald-500'
                  }`}
                />
              </div>
              {invalidCcLot && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm font-medium">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  {LOTE_INCORRECTO_MSG}
                </div>
              )}
            </div>

            <div className="border-t-2 border-emerald-200 pt-4 space-y-3">
              <PaymentFields
                amounts={amounts}
                onChange={(method, amount) => setAmounts((prev) => ({ ...prev, [method]: amount }))}
              />

              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 flex justify-between items-center border-2 border-emerald-300">
                <span className="text-xl font-bold text-slate-800">Total:</span>
                <span className="text-3xl font-bold text-emerald-600">
                  ${total.toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleCompleteSale}
                disabled={!cart.length}
                className="w-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 hover:from-emerald-600 hover:via-green-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-xl transition-all hover:scale-105 disabled:hover:scale-100"
              >
                <CreditCard size={24} />
                Completar Venta
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
