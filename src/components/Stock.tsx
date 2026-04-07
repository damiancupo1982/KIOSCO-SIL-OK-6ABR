import { useState, useEffect } from 'react';
import { supabase, Product } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, AlertTriangle, TrendingDown, TrendingUp, Package } from 'lucide-react';

const PREDEFINED_CATEGORIES = ['Bebida', 'Comida', 'Artículos de Deporte'];

type SortOption = 'name' | 'category' | 'stock';

interface ProductWithSales extends Product {
  sales_last_7_days: number;
}

export default function Stock() {
  const [products, setProducts] = useState<ProductWithSales[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    price: '',
    cost: '',
    stock: '',
    min_stock: ''
  });

  const [categoryOption, setCategoryOption] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('');

  const askAdminPassword = () => {
    const password = window.prompt('Ingresá la clave de administrador:');

    if (!password) {
      alert('Operación cancelada.');
      return false;
    }

    if (password === 'admin123') {
      return true;
    }

    alert('Clave incorrecta. No tenés permisos para esta acción.');
    return false;
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (!productsData) {
      setProducts([]);
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: salesData } = await supabase
      .from('sales')
      .select('items')
      .gte('created_at', sevenDaysAgo.toISOString());

    const salesByProduct: Record<string, number> = {};

    salesData?.forEach((sale) => {
      if (Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const productId = item.product_id;
          const quantity = item.quantity || 0;
          salesByProduct[productId] = (salesByProduct[productId] || 0) + quantity;
        });
      }
    });

    const productsWithSales: ProductWithSales[] = productsData.map((product) => ({
      ...product,
      sales_last_7_days: salesByProduct[product.id] || 0
    }));

    setProducts(productsWithSales);
  };

  const generateSuggestedCode = () => {
    const numericCodes = products
      .map((p) => parseInt(p.code, 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (numericCodes.length > 0) {
      const max = Math.max(...numericCodes);
      return String(max + 1).padStart(4, '0');
    }

    return `P-${products.length + 1}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const codeTrimmed = formData.code.trim();
    if (!codeTrimmed) {
      alert('El código no puede estar vacío.');
      return;
    }

    const { data: existingCodes, error: codeCheckError } = await supabase
      .from('products')
      .select('id, code')
      .eq('code', codeTrimmed);

    if (codeCheckError) {
      console.error('Error verificando código:', codeCheckError);
      alert('Ocurrió un error al verificar el código. Intentá de nuevo.');
      return;
    }

    if (!editingProduct) {
      if (existingCodes && existingCodes.length > 0) {
        alert('Código en uso. Ingresá un nuevo código.');
        return;
      }
    } else {
      const conflict = existingCodes?.some((p) => p.id !== editingProduct.id);
      if (conflict) {
        alert('Código en uso por otro producto. Ingresá un nuevo código.');
        return;
      }
    }

    const newStock = parseInt(formData.stock) || 0;

    let finalCategory = '';
    if (categoryOption === '__CUSTOM__') {
      finalCategory = customCategory.trim();
    } else if (categoryOption) {
      finalCategory = categoryOption;
    }

    const productData = {
      code: codeTrimmed,
      name: formData.name,
      description: formData.description,
      category: finalCategory,
      price: parseFloat(formData.price) || 0,
      cost: parseFloat(formData.cost) || 0,
      stock: newStock,
      min_stock: parseInt(formData.min_stock) || 0,
      active: true,
      updated_at: new Date().toISOString()
    };

    if (editingProduct) {
      const previousStock = editingProduct.stock ?? 0;

      if (newStock !== previousStock) {
        const ok = askAdminPassword();
        if (!ok) return;
      }

      await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
    } else {
      await supabase.from('products').insert([productData]);
    }

    loadProducts();
    closeModal();
  };

  const handleDelete = async (id: string) => {
    const ok = askAdminPassword();
    if (!ok) return;

    if (confirm('¿Eliminar este producto?')) {
      await supabase.from('products').delete().eq('id', id);
      loadProducts();
    }
  };

  const handleEdit = (product: Product) => {
    let option = '';
    let custom = '';

    if (product.category && PREDEFINED_CATEGORIES.includes(product.category)) {
      option = product.category;
      custom = '';
    } else if (product.category) {
      option = '__CUSTOM__';
      custom = product.category;
    } else {
      option = '';
      custom = '';
    }

    setEditingProduct(product);
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      price: product.price.toString(),
      cost: product.cost.toString(),
      stock: product.stock.toString(),
      min_stock: product.min_stock.toString()
    });
    setCategoryOption(option);
    setCustomCategory(custom);
    setShowModal(true);
  };

  const openNewModal = () => {
    const suggestedCode = generateSuggestedCode();

    setEditingProduct(null);
    setFormData({
      code: suggestedCode,
      name: '',
      description: '',
      category: '',
      price: '',
      cost: '',
      stock: '',
      min_stock: ''
    });
    setCategoryOption('');
    setCustomCategory('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const getStockLevel = (product: Product) => {
    if (product.stock === 0) return 'sin-stock';
    if (product.stock <= product.min_stock) return 'bajo';
    if (product.stock <= product.min_stock * 2) return 'medio';
    return 'alto';
  };

  const getStockColor = (level: string) => {
    switch (level) {
      case 'sin-stock': return 'bg-slate-400';
      case 'bajo': return 'bg-red-500';
      case 'medio': return 'bg-amber-500';
      case 'alto': return 'bg-emerald-500';
      default: return 'bg-slate-400';
    }
  };

  const getStockPercentage = (product: Product) => {
    const maxStock = product.min_stock * 3;
    if (maxStock === 0) return product.stock > 0 ? 100 : 0;
    const percentage = (product.stock / maxStock) * 100;
    return Math.min(percentage, 100);
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'category') {
      return (a.category || '').localeCompare(b.category || '');
    } else if (sortBy === 'stock') {
      const levelOrder = { 'sin-stock': 0, 'bajo': 1, 'medio': 2, 'alto': 3 };
      const levelA = getStockLevel(a);
      const levelB = getStockLevel(b);
      return levelOrder[levelA as keyof typeof levelOrder] - levelOrder[levelB as keyof typeof levelOrder];
    }
    return 0;
  });

  const lowStockProducts = products.filter((p) => p.stock <= p.min_stock);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <button
          onClick={openNewModal}
          className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all duration-200 hover:scale-105"
        >
          <Plus size={20} />
          Nuevo Producto
        </button>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="text-amber-600 flex-shrink-0 mt-0.5"
              size={24}
            />
            <div className="flex-1">
              <h3 className="font-bold text-amber-900 mb-2">
                Alerta de Stock Bajo
              </h3>
              <div className="flex flex-wrap gap-2">
                {lowStockProducts.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 bg-white text-amber-800 px-3 py-1 rounded-lg text-sm font-medium shadow-sm"
                  >
                    <TrendingDown size={14} />
                    {p.name} ({p.stock})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-600">Ordenar por:</span>
        <button
          onClick={() => setSortBy('name')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            sortBy === 'name'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Alfabético
        </button>
        <button
          onClick={() => setSortBy('category')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            sortBy === 'category'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Categoría
        </button>
        <button
          onClick={() => setSortBy('stock')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            sortBy === 'stock'
              ? 'bg-blue-500 text-white shadow-lg'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Estado de Stock
        </button>
      </div>

      <div className="space-y-3">
        {sortedProducts.map((product) => {
          const stockLevel = getStockLevel(product);
          const stockPercentage = getStockPercentage(product);

          return (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-slate-200 overflow-hidden"
            >
              <div className={`h-1.5 ${getStockColor(stockLevel)}`} style={{ width: `${stockPercentage}%` }}></div>

              <div className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
                        <Package className="text-white" size={24} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                      <div className="md:col-span-2">
                        <h3 className="font-bold text-slate-800 text-base truncate">
                          {product.name}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                            {product.code}
                          </span>
                          {product.category && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                              {product.category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-slate-500">Precio</p>
                        <p className="text-lg font-bold text-emerald-600">
                          ${product.price.toFixed(2)}
                        </p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-slate-500">Stock</p>
                        <p className={`text-base font-bold ${
                          stockLevel === 'sin-stock' ? 'text-slate-500' :
                          stockLevel === 'bajo' ? 'text-red-600' :
                          stockLevel === 'medio' ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>
                          {product.stock} un.
                        </p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-slate-500">Vend. 7d</p>
                        <p className="text-base font-bold text-blue-600 flex items-center justify-center gap-1">
                          <TrendingUp size={14} />
                          {product.sales_last_7_days}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>

                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sortedProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="mx-auto text-slate-400 mb-4" size={64} />
          <h3 className="text-xl font-bold text-slate-700">No hay productos</h3>
          <p className="text-slate-500">Agrega productos para comenzar</p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl animate-slideUp">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Categoría
                  </label>
                  <select
                    value={categoryOption}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCategoryOption(value);
                      if (value !== '__CUSTOM__') {
                        setCustomCategory('');
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="">Sin categoría</option>
                    {PREDEFINED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__CUSTOM__">Ingresar Nueva Categoría</option>
                  </select>

                  {categoryOption === '__CUSTOM__' && (
                    <input
                      type="text"
                      placeholder="Nombre de la nueva categoría"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="mt-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Precio *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Costo
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) =>
                      setFormData({ ...formData, cost: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Stock *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.stock}
                    onChange={(e) =>
                      setFormData({ ...formData, stock: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Stock Mínimo
                  </label>
                  <input
                    type="number"
                    value={formData.min_stock}
                    onChange={(e) =>
                      setFormData({ ...formData, min_stock: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg transition-all duration-200 hover:scale-105"
                >
                  {editingProduct ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
