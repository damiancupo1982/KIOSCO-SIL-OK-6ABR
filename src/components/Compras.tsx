import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, FileText, Plus, Trash2, X, AlertTriangle } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  code: string;
  price: number;
  cost: number;
  stock: number;
  category: string;
  supplier: string;
}

interface PurchaseItem {
  tempId: string;
  product_id: string;
  product_name: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  subtotal: number;
}

interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier: string;
  total: number;
  paid_amount: number;
  status: 'pending' | 'partial' | 'paid';
  created_at: string;
}

interface InvoiceDetail extends PurchaseInvoice {
  items: {
    product_name: string;
    quantity: number;
    purchase_price: number;
    sale_price: number;
    subtotal: number;
  }[];
}

interface ComprasProps {
  shift: any;
}

export default function Compras({ shift }: ComprasProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [invoiceToDelete, setInvoiceToDelete] = useState<PurchaseInvoice | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [currentItem, setCurrentItem] = useState({
    product_id: '',
    product_name: '',
    quantity: '',
    purchase_price: '',
    sale_price: '',
  });
  const [supplier, setSupplier] = useState('');
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadProducts();
    loadInvoices();
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(''), 4000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  const loadCurrentUser = () => {
    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (data) setProducts(data);
  };

  const loadInvoices = async () => {
    const { data } = await supabase.from('purchase_invoices').select('*').order('created_at', { ascending: false });
    if (data) setInvoices(data);
  };

  const loadInvoiceDetail = async (invoiceId: string) => {
    const { data: invoice } = await supabase.from('purchase_invoices').select('*').eq('id', invoiceId).single();
    const { data: items } = await supabase
      .from('purchase_invoice_items')
      .select('*, products(name)')
      .eq('invoice_id', invoiceId);
    if (invoice && items) {
      setSelectedInvoice({
        ...invoice,
        items: items.map((i: any) => ({
          product_name: i.products?.name || '',
          quantity: i.quantity,
          purchase_price: i.purchase_price,
          sale_price: i.sale_price,
          subtotal: i.subtotal,
        })),
      });
    }
  };

  const handleProductChange = (value: string) => {
    if (value === 'new') {
      setShowNewProductModal(true);
      return;
    }
    const product = products.find(p => p.id === value);
    if (product) {
      setCurrentItem(prev => ({
        ...prev,
        product_id: product.id,
        product_name: product.name,
        sale_price: product.price.toString(),
        purchase_price: product.cost.toString(),
      }));
    }
  };

  const handleAddNewProduct = async () => {
    if (!newProductName.trim()) return;
    const code = 'PROD-' + Date.now().toString().slice(-8);
    await supabase.from('products').insert({
      code,
      name: newProductName,
      price: parseFloat(currentItem.sale_price) || 0,
      cost: parseFloat(currentItem.purchase_price) || 0,
      stock: 0,
      category: '',
      supplier,
    });
    await loadProducts();
    setShowNewProductModal(false);
    setNewProductName('');
  };

  const addItemToPurchase = () => {
    if (!currentItem.product_id) return;
    const quantity = parseFloat(currentItem.quantity);
    const purchase_price = parseFloat(currentItem.purchase_price);
    if (!(quantity > 0) || !(purchase_price > 0)) return;
    const subtotal = quantity * purchase_price;
    setPurchaseItems(prev => [
      ...prev,
      {
        tempId: Date.now().toString(),
        product_id: currentItem.product_id,
        product_name: currentItem.product_name,
        quantity,
        purchase_price,
        sale_price: parseFloat(currentItem.sale_price) || 0,
        subtotal,
      },
    ]);
    setCurrentItem({ product_id: '', product_name: '', quantity: '', purchase_price: '', sale_price: '' });
  };

  const removeItem = (tempId: string) => {
    setPurchaseItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  const getTotalPurchase = () => purchaseItems.reduce((sum, i) => sum + i.subtotal, 0);

  const savePurchaseInvoice = async () => {
    if (purchaseItems.length === 0 || !supplier.trim()) return;

    let invoiceNumber: string;
    const { data: numberData, error: rpcError } = await supabase.rpc('generate_purchase_invoice_number');
    if (rpcError || !numberData) {
      invoiceNumber = 'FC-' + Date.now();
    } else {
      invoiceNumber = numberData;
    }

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .insert({ invoice_number: invoiceNumber, supplier, total: getTotalPurchase(), paid_amount: 0, status: 'pending' })
      .select()
      .single();

    if (invoiceError || !invoiceData) {
      setErrorMessage('Error al guardar la factura');
      return;
    }

    await supabase.from('purchase_invoice_items').insert(
      purchaseItems.map(item => ({
        invoice_id: invoiceData.id,
        product_id: item.product_id,
        quantity: item.quantity,
        purchase_price: item.purchase_price,
        sale_price: item.sale_price,
        subtotal: item.subtotal,
      }))
    );

    // Update cost, price, supplier and stock for each product.
    // We fetch the current stock value to compute the new total manually. This
    // ensures that purchases immediately impact stock levels even if a
    // database trigger is not present or fails to fire.
    for (const item of purchaseItems) {
      // Get the current stock for the product
      const { data: productData } = await supabase
        .from('products')
        .select('stock')
        .eq('id', item.product_id)
        .single();
      const currentStock = productData?.stock ?? 0;
      const newStock = currentStock + item.quantity;
      // Update cost, price, supplier and stock
      await supabase
        .from('products')
        .update({
          cost: item.purchase_price,
          price: item.sale_price,
          supplier,
          stock: newStock,
        })
        .eq('id', item.product_id);
    }

    setPurchaseItems([]);
    setSupplier('');
    await loadProducts();
    await loadInvoices();
    setSuccessMessage('Factura guardada exitosamente');
  };

  const handlePayInvoice = async () => {
    if (!selectedInvoice) return;
    if (!shift) {
      setErrorMessage('No hay turno activo');
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (!(amount > 0)) return;
    const pending = selectedInvoice.total - selectedInvoice.paid_amount;
    if (amount > pending) return;

    await supabase.from('purchase_payments').insert({
      invoice_id: selectedInvoice.id,
      amount,
      payment_method: paymentMethod,
    });

    await supabase.from('cash_transactions').insert({
      type: 'expense',
      category: 'Compras',
      amount,
      payment_method: paymentMethod,
      shift_id: shift.id,
      description: `Pago factura ${selectedInvoice.invoice_number} - ${selectedInvoice.supplier}`,
    });

    const { data: shiftData } = await supabase.from('shifts').select('total_expenses').eq('id', shift.id).single();
    const currentExpenses = shiftData?.total_expenses || 0;
    await supabase.from('shifts').update({ total_expenses: currentExpenses + amount }).eq('id', shift.id);

    await loadInvoices();
    await loadInvoiceDetail(selectedInvoice.id);
    setShowPaymentModal(false);
    setPaymentAmount('');
    setPaymentMethod('efectivo');
    setSuccessMessage('Pago registrado exitosamente');
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    if (deletePassword !== '842114') {
      setErrorMessage('Contraseña incorrecta');
      return;
    }
    if (invoiceToDelete.paid_amount > 0) {
      setErrorMessage('No se puede eliminar una factura con pagos registrados');
      return;
    }

    const { data: items } = await supabase
      .from('purchase_invoice_items')
      .select('*')
      .eq('invoice_id', invoiceToDelete.id);

    if (items) {
      for (const item of items) {
        const { data: productData } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
        if (productData) {
          await supabase.from('products').update({ stock: (productData.stock || 0) - item.quantity }).eq('id', item.product_id);
        }
      }
    }

    await supabase.from('inventory_movements').delete().eq('reference', invoiceToDelete.invoice_number);
    await supabase.from('purchase_invoices').delete().eq('id', invoiceToDelete.id);

    setSelectedInvoice(null);
    setShowDeleteModal(false);
    setDeletePassword('');
    setInvoiceToDelete(null);
    await loadInvoices();
    await loadProducts();
    setSuccessMessage('Factura eliminada y stock revertido');
  };

  const statusBadge = (status: string) => {
    if (status === 'paid') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Pagado</span>;
    if (status === 'partial') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Parcial</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Pendiente</span>;
  };

  return (
    <div>
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 font-medium flex items-center gap-2">
          <span>✓</span> {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium flex items-center gap-2">
          <AlertTriangle size={16} /> {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
          <div className="bg-blue-600 text-white px-6 py-4 flex items-center gap-3">
            <Package size={22} />
            <h2 className="text-lg font-bold">Nueva Compra</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre del proveedor"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Producto</label>
                <select
                  value={currentItem.product_id}
                  onChange={e => handleProductChange(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="new">+ Agregar Nuevo Producto</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  step="0.01"
                  value={currentItem.quantity}
                  onChange={e => setCurrentItem(prev => ({ ...prev, quantity: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Precio Compra</label>
                <input
                  type="number"
                  step="0.01"
                  value={currentItem.purchase_price}
                  onChange={e => setCurrentItem(prev => ({ ...prev, purchase_price: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Precio Venta</label>
                <input
                  type="number"
                  step="0.01"
                  value={currentItem.sale_price}
                  onChange={e => setCurrentItem(prev => ({ ...prev, sale_price: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <button
              onClick={addItemToPurchase}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={16} /> Agregar Item
            </button>

            {purchaseItems.length > 0 && (
              <div className="space-y-2">
                {purchaseItems.map(item => (
                  <div key={item.tempId} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 text-sm">
                    <span className="font-medium text-slate-700">{item.product_name}</span>
                    <span className="text-slate-500">{item.quantity} × ${item.purchase_price.toFixed(2)} = <strong>${item.subtotal.toFixed(2)}</strong></span>
                    <button onClick={() => removeItem(item.tempId)} className="text-red-500 hover:text-red-700 ml-2">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-sm font-bold text-blue-700">
                  Total: ${getTotalPurchase().toFixed(2)}
                </div>
              </div>
            )}

            <button
              onClick={savePurchaseInvoice}
              disabled={purchaseItems.length === 0 || !supplier.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              Guardar Factura de Compra
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
          <div className="bg-slate-700 text-white px-6 py-4 flex items-center gap-3">
            <FileText size={22} />
            <h2 className="text-lg font-bold">Facturas de Compra</h2>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto space-y-3">
            {invoices.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-8">No hay facturas registradas</p>
            )}
            {invoices.map(inv => (
              <div
                key={inv.id}
                onClick={() => loadInvoiceDetail(inv.id)}
                className="border border-slate-200 rounded-xl p-4 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800 text-sm">{inv.invoice_number}</span>
                  {statusBadge(inv.status)}
                </div>
                <p className="font-semibold text-slate-700 text-sm">{inv.supplier}</p>
                <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                  <span>{new Date(inv.created_at).toLocaleDateString('es-AR')}</span>
                  <span className="font-bold text-slate-700">Total: ${Number(inv.total).toFixed(2)}</span>
                </div>
                {(inv.status === 'partial' || inv.status === 'pending') && (
                  <div className="flex gap-3 mt-1 text-xs">
                    <span className="text-green-600">Pagado: ${Number(inv.paid_amount).toFixed(2)}</span>
                    <span className="text-red-600">Pendiente: ${(Number(inv.total) - Number(inv.paid_amount)).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full mx-4 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{selectedInvoice.invoice_number}</h3>
                <p className="text-slate-500 text-sm">{selectedInvoice.supplier} · {new Date(selectedInvoice.created_at).toLocaleDateString('es-AR')}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X size={22} />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase border-b border-slate-100">
                    <th className="text-left pb-2">Producto</th>
                    <th className="text-right pb-2">Cant.</th>
                    <th className="text-right pb-2">P.Compra</th>
                    <th className="text-right pb-2">P.Venta</th>
                    <th className="text-right pb-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-700">{item.product_name}</td>
                      <td className="py-1.5 text-right text-slate-600">{item.quantity}</td>
                      <td className="py-1.5 text-right text-slate-600">${Number(item.purchase_price).toFixed(2)}</td>
                      <td className="py-1.5 text-right text-slate-600">${Number(item.sale_price).toFixed(2)}</td>
                      <td className="py-1.5 text-right font-medium">${Number(item.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 space-y-1 text-sm">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Total</span>
                <span>${Number(selectedInvoice.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Pagado</span>
                <span>${Number(selectedInvoice.paid_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Pendiente</span>
                <span>${(Number(selectedInvoice.total) - Number(selectedInvoice.paid_amount)).toFixed(2)}</span>
              </div>
            </div>

            <div className="px-6 py-4 flex gap-3 justify-end border-t border-slate-200">
              {selectedInvoice.status !== 'paid' && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                >
                  Registrar Pago
                </button>
              )}
              <button
                onClick={() => { setInvoiceToDelete(selectedInvoice); setShowDeleteModal(true); }}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                <Trash2 size={15} /> Eliminar Factura
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Registrar Pago</h3>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm font-semibold text-red-700">
              Saldo pendiente: ${(Number(selectedInvoice.total) - Number(selectedInvoice.paid_amount)).toFixed(2)}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto</label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Método de pago</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="qr">QR</option>
                <option value="expensas">Expensas</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentAmount(''); setPaymentMethod('efectivo'); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handlePayInvoice}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Nuevo Producto</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del producto</label>
              <input
                type="text"
                value={newProductName}
                onChange={e => setNewProductName(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre del producto"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowNewProductModal(false); setNewProductName(''); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddNewProduct}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && invoiceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={28} className="text-red-600" />
              <h3 className="font-bold text-slate-800 text-lg">Eliminar Factura</h3>
            </div>
            <p className="text-sm text-slate-600">
              Esta acción revertirá el stock. Si la factura tiene pagos, no se puede eliminar.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Ingrese la contraseña"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setInvoiceToDelete(null); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteInvoice}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                <Trash2 size={15} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}