import { useState, useEffect } from 'react';
import { supabase, Product, Shift } from '../lib/supabase';
import { Package, TrendingUp, TrendingDown, Filter, Plus, Search } from 'lucide-react';

interface InventoryMovement {
  id: string;
  product_id: string;
  product_name: string;
  product_category: string;
  type: 'entrada' | 'salida';
  quantity: number;
  reason: string;
  supplier: string;
  user_name: string;
  notes: string;
  created_at: string;
}

interface MovimientosProps {
  shift: Shift | null;
}

export default function Movimientos({ shift }: MovimientosProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    supplier: '',
    notes: ''
  });

  const [filterType, setFilterType] = useState<'all' | 'entrada' | 'salida'>('all');
  const [filterBy, setFilterBy] = useState<'fecha' | 'producto' | 'proveedor' | 'rubro'>('fecha');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  const loadData = async () => {
    setLoading(true);

    let query = supabase
      .from('inventory_movements')
      .select('*')
      .order('created_at', { ascending: false });

    if (dateFilter === 'today') {
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
    }

    const [{ data: movementsData }, { data: productsData }] = await Promise.all([
      query,
      supabase.from('products').select('*').eq('active', true).order('name')
    ]);

    setMovements(movementsData || []);
    setProducts(productsData || []);
    setLoading(false);
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!shift) {
      alert('Necesitas un turno activo para registrar movimientos');
      return;
    }

    const product = products.find(p => p.id === formData.product_id);
    if (!product) {
      alert('Selecciona un producto válido');
      return;
    }

    const quantity = parseInt(formData.quantity) || 0;
    if (quantity <= 0) {
      alert('La cantidad debe ser mayor a 0');
      return;
    }

    const movementData = {
      product_id: product.id,
      product_name: product.name,
      product_category: product.category || '',
      type: 'entrada' as const,
      quantity: quantity,
      reason: 'compra_proveedor',
      supplier: formData.supplier.trim(),
      user_name: shift.user_name,
      notes: formData.notes.trim()
    };

    const { error: movementError } = await supabase
      .from('inventory_movements')
      .insert([movementData]);

    if (movementError) {
      console.error('Error registrando movimiento:', movementError);
      alert('Error al registrar el movimiento');
      return;
    }

    const newStock = product.stock + quantity;
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', product.id);

    if (stockError) {
      console.error('Error actualizando stock:', stockError);
      alert('El movimiento se registró pero hubo un error al actualizar el stock');
    } else {
      alert('Ingreso de mercadería registrado exitosamente');
    }

    setFormData({ product_id: '', quantity: '', supplier: '', notes: '' });
    setShowAddModal(false);
    loadData();
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
      hour12: false
    });

    return { date: dateStr, time: timeStr };
  };

  const filteredMovements = movements.filter(movement => {
    if (filterType !== 'all' && movement.type !== filterType) return false;

    if (!searchTerm) return true;

    const search = searchTerm.toLowerCase();

    switch (filterBy) {
      case 'producto':
        return movement.product_name.toLowerCase().includes(search);
      case 'proveedor':
        return movement.supplier.toLowerCase().includes(search);
      case 'rubro':
        return movement.product_category.toLowerCase().includes(search);
      case 'fecha':
      default:
        return (
          movement.product_name.toLowerCase().includes(search) ||
          movement.supplier.toLowerCase().includes(search) ||
          movement.user_name.toLowerCase().includes(search)
        );
    }
  });

  const totalEntradas = filteredMovements
    .filter(m => m.type === 'entrada')
    .reduce((sum, m) => sum + m.quantity, 0);

  const totalSalidas = filteredMovements
    .filter(m => m.type === 'salida')
    .reduce((sum, m) => sum + m.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h3 className="text-xl font-bold text-slate-800">
          Movimientos de Inventario
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all duration-200 hover:scale-105"
        >
          <Plus size={20} />
          Registrar Ingreso
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">Total Entradas</p>
              <p className="text-3xl font-bold mt-2">{totalEntradas}</p>
            </div>
            <TrendingUp className="opacity-80" size={40} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Total Salidas</p>
              <p className="text-3xl font-bold mt-2">{totalSalidas}</p>
            </div>
            <TrendingDown className="opacity-80" size={40} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Movimientos</p>
              <p className="text-3xl font-bold mt-2">{filteredMovements.length}</p>
            </div>
            <Package className="opacity-80" size={40} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-slate-600" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todo el período</option>
              <option value="today">Hoy</option>
              <option value="week">Última semana</option>
              <option value="month">Último mes</option>
              <option value="currentMonth">Mes en curso</option>
              <option value="previousMonth">Mes anterior</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los tipos</option>
              <option value="entrada">Solo entradas</option>
              <option value="salida">Solo salidas</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as any)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            >
              <option value="fecha">Buscar por todo</option>
              <option value="producto">Por producto</option>
              <option value="proveedor">Por proveedor</option>
              <option value="rubro">Por rubro</option>
            </select>
          </div>

          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              placeholder={`Buscar ${filterBy === 'fecha' ? '' : 'por ' + filterBy}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Cargando movimientos...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Hora
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Rubro
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Notas
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredMovements.map((movement) => {
                  const { date, time } = formatDateTime(movement.created_at);
                  return (
                    <tr key={movement.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                        {date}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600 font-mono">
                        {time}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                            movement.type === 'entrada'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {movement.type === 'entrada' ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}
                          {movement.type === 'entrada' ? 'Entrada' : 'Salida'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {movement.product_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {movement.product_category || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900">
                        {movement.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {movement.supplier || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {movement.user_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                        {movement.notes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredMovements.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No hay movimientos para mostrar
              </div>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">
                Registrar Ingreso de Mercadería
              </h3>
            </div>

            <form onSubmit={handleAddMovement} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Producto *
                </label>
                <select
                  required
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Selecciona un producto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} - Stock actual: {product.stock}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Cantidad *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="Cantidad a ingresar"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Proveedor
                </label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="Nombre del proveedor"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Notas
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="Observaciones adicionales"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData({ product_id: '', quantity: '', supplier: '', notes: '' });
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 shadow-lg"
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
