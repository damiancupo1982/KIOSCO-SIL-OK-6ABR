import { useState, useEffect } from 'react';
import { supabase, Product, SaleItem, Shift } from '../lib/supabase';
import { Search, Minus, Plus, Trash2, ShoppingCart, CreditCard, BookOpen } from 'lucide-react';

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

  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [qrAmount, setQrAmount] = useState(0);
  const [expensasAmount, setExpensasAmount] = useState(0);
  const [cuentaCorrienteAmount, setCuentaCorrienteAmount] = useState(0);

  useEffect(() => {
    loadProducts();
  }, []);

  const total = cart.reduce((sum, i) => sum + i.subtotal, 0);

  useEffect(() => {
    const sum = cashAmount + transferAmount + qrAmount + expensasAmount + cuentaCorrienteAmount;

    if (total > 0 && sum === 0) {
      setCashAmount(total);
    }

    if (total === 0 && sum !== 0) {
      setCashAmount(0);
      setTransferAmount(0);
      setQrAmount(0);
      setExpensasAmount(0);
      setCuentaCorrienteAmount(0);
    }
  }, [total]);

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .gt('stock', 0);

    setProducts(data || []);
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

  const parseAmount = (value: string) => {
    if (!value) return 0;
    const n = parseFloat(value.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const handleCompleteSale = async () => {
    if (!cart.length || !shift) {
      return alert('Carrito vacío o sin turno activo');
    }

    let payments = [
      { method: 'efectivo', amount: cashAmount },
      { method: 'transferencia', amount: transferAmount },
      { method: 'qr', amount: qrAmount },
      { method: 'expensas', amount: expensasAmount },
      { method: 'cuenta_corriente', amount: cuentaCorrienteAmount },
    ].filter((p) => p.amount > 0.009);

    if (payments.length === 0) {
      payments = [{ method: 'efectivo', amount: total }];
      setCashAmount(total);
    }

    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);

    if (Math.abs(paymentsTotal - total) > 0.01) {
      return alert(
        `La suma de los montos de pago (${paymentsTotal.toFixed(
          2
        )}) no coincide con el total (${total.toFixed(2)}).`
      );
    }

    const hasCuentaCorriente = payments.some((p) => p.method === 'cuenta_corriente');
    const hasNonCash = payments.some((p) => p.method !== 'efectivo');
    if (hasNonCash && (!customerName.trim() || !customerLot.trim())) {
      return alert(
        'Para pagos que no son en efectivo debés completar el nombre y el lote del cliente.'
      );
    }

    let storedPaymentMethod = payments[0].method;
    if (payments.some((p) => p.method === 'efectivo')) {
      storedPaymentMethod = 'efectivo';
    }
    if (hasCuentaCorriente && payments.length === 1) {
      storedPaymentMethod = 'cuenta_corriente';
    }

    const saleNumber = `V-${Date.now()}`;
    const saleData = {
      sale_number: saleNumber,
      user_id: shift.user_id,
      user_name: shift.user_name,
      shift_id: shift.id,
      items: cart,
      subtotal: total,
      discount: 0,
      total,
      payment_method: storedPaymentMethod,
      customer_name: customerName.trim() || null,
      customer_lot: customerLot.trim() || null,
      payments: payments,
    };

    const { data: saleResult, error: saleError } = await supabase
      .from('sales')
      .insert([saleData])
      .select()
      .single();

    if (saleError) {
      console.error('Error insertando venta:', saleError);
      alert(`Error al registrar la venta: ${saleError.message}`);
      return;
    }

    for (const item of cart) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod) {
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: prod.stock - item.quantity })
          .eq('id', item.product_id);

        if (stockError) {
          console.error('Error actualizando stock:', stockError);
        }
      }
    }

    const cashRows = payments
      .filter((p) => p.method !== 'cuenta_corriente')
      .map((p) => ({
        shift_id: shift.id,
        type: 'income',
        category: 'venta',
        amount: p.amount,
        payment_method: p.method,
        description: `Venta ${saleNumber}${
          customerName.trim() || customerLot.trim()
            ? ` - ${customerName.trim()} (Lote ${customerLot.trim() || '-'})`
            : ''
        }`,
      }));

    if (hasCuentaCorriente) {
      const ccAmount = payments.find((p) => p.method === 'cuenta_corriente')!.amount;
      cashRows.push({
        shift_id: shift.id,
        type: 'income',
        category: 'venta',
        amount: ccAmount,
        payment_method: 'cuenta_corriente',
        description: `Venta ${saleNumber} - ${customerName.trim()} (Lote ${customerLot.trim() || '-'}) [Cuenta Corriente]`,
      });

      const { data: existingAccount } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('customer_name', customerName.trim())
        .eq('customer_lot', customerLot.trim())
        .maybeSingle();

      let accountId: string;
      let currentDebt = 0;

      if (existingAccount) {
        accountId = existingAccount.id;
        currentDebt = Number(existingAccount.total_debt);
      } else {
        const { data: newAccount, error: accountError } = await supabase
          .from('customer_accounts')
          .insert([{
            customer_name: customerName.trim(),
            customer_lot: customerLot.trim(),
            total_debt: 0,
          }])
          .select()
          .single();

        if (accountError || !newAccount) {
          console.error('Error creando cuenta corriente:', accountError);
          alert('Error al registrar la cuenta corriente.');
          return;
        }
        accountId = newAccount.id;
      }

      const newBalance = currentDebt + ccAmount;

      await supabase
        .from('customer_accounts')
        .update({ total_debt: newBalance, updated_at: new Date().toISOString() })
        .eq('id', accountId);

      await supabase
        .from('current_account_transactions')
        .insert([{
          customer_account_id: accountId,
          customer_name: customerName.trim(),
          customer_lot: customerLot.trim(),
          type: 'cargo',
          amount: ccAmount,
          balance_after: newBalance,
          sale_id: saleResult?.id || null,
          sale_number: saleNumber,
          description: `Venta ${saleNumber}`,
          user_name: shift.user_name,
          shift_id: shift.id,
        }]);
    }

    if (cashRows.length > 0) {
      const { error: cashError } = await supabase
        .from('cash_transactions')
        .insert(cashRows);

      if (cashError) {
        console.error('Error insertando caja:', cashError);
        alert(
          'La venta se registró, pero hubo un error al registrar el movimiento en caja.'
        );
        return;
      }
    }

    alert('Venta completada');

    setCart([]);
    setCustomerName('');
    setCustomerLot('');
    setCashAmount(0);
    setTransferAmount(0);
    setQrAmount(0);
    setExpensasAmount(0);
    setCuentaCorrienteAmount(0);
    loadProducts();
  };

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
                  placeholder="Nombre del cliente"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Lote"
                  value={customerLot}
                  onChange={(e) => setCustomerLot(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="border-t-2 border-emerald-200 pt-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 hover:border-emerald-300 transition-all">
                  <span className="text-sm font-semibold text-slate-700">
                    Efectivo
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cashAmount || ''}
                    onChange={(e) => setCashAmount(parseAmount(e.target.value))}
                    className="w-28 px-2 py-1 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                </div>

                <div className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 hover:border-emerald-300 transition-all">
                  <span className="text-sm font-semibold text-slate-700">
                    Transferencia
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={transferAmount || ''}
                    onChange={(e) =>
                      setTransferAmount(parseAmount(e.target.value))
                    }
                    className="w-28 px-2 py-1 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                </div>

                <div className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 hover:border-emerald-300 transition-all">
                  <span className="text-sm font-semibold text-slate-700">QR</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={qrAmount || ''}
                    onChange={(e) => setQrAmount(parseAmount(e.target.value))}
                    className="w-28 px-2 py-1 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                </div>

                <div className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 hover:border-emerald-300 transition-all">
                  <span className="text-sm font-semibold text-slate-700">
                    Expensas
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={expensasAmount || ''}
                    onChange={(e) =>
                      setExpensasAmount(parseAmount(e.target.value))
                    }
                    className="w-28 px-2 py-1 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                </div>

                <div className="flex items-center justify-between bg-amber-50 border-2 border-amber-200 rounded-xl px-3 py-2.5 hover:border-amber-400 transition-all">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-amber-600" />
                    <span className="text-sm font-semibold text-amber-700">
                      Cta. Corriente
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cuentaCorrienteAmount || ''}
                    onChange={(e) =>
                      setCuentaCorrienteAmount(parseAmount(e.target.value))
                    }
                    className="w-28 px-2 py-1 bg-white border-2 border-amber-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-500"
                    placeholder="0"
                  />
                </div>
              </div>

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
  );
}
