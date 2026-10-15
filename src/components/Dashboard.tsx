import { useState, useEffect } from 'react';
import { ShoppingCart, Package, Wallet, BarChart3, Settings, Store, Clock, Lightbulb, Users, TrendingUp, Layers, BookOpen, ShoppingBag, UserCheck, CalendarDays } from 'lucide-react';
import { Shift, supabase } from '../lib/supabase';
import Ventas from './Ventas';
import Stock from './Stock';
import Caja from './Caja';
import Reportes from './Reportes';
import Configuracion from './Configuracion';
import Movimientos from './Movimientos';
import CuentaCorriente from './CuentaCorriente';
import Compras from './Compras';
import Socios from './Socios';
import Reservas from './reservas/Reservas';

type View = 'ventas' | 'stock' | 'caja' | 'reportes' | 'configuracion' | 'movimientos' | 'cuentacorriente' | 'compras' | 'socios' | 'reservas';

interface DashboardProps {
  shift: Shift | null;
  onCloseShift: (closingCash: number) => void;
}

interface SalesStats {
  lucesToday: number;
  lucesMonth: number;
  invitadosToday: number;
  invitadosMonth: number;
  topProduct: { name: string; quantity: number } | null;
  paletasToday: number;
  paletasMonth: number;
}

export default function Dashboard({ shift, onCloseShift }: DashboardProps) {
  const [currentView, setCurrentView] = useState<View>('ventas');
  const [businessName, setBusinessName] = useState('Kiosco Damian');
  const [currentTime, setCurrentTime] = useState('');



  const [stats, setStats] = useState<SalesStats>({
    lucesToday: 0,
    lucesMonth: 0,
    invitadosToday: 0,
    invitadosMonth: 0,
    topProduct: null,
    paletasToday: 0,
    paletasMonth: 0,
  });

  useEffect(() => {
    loadBusinessName();
    updateClock();
    loadStats();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateClock = () => {
    const now = new Date();
    const argTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const hours = String(argTime.getHours()).padStart(2, '0');
    const minutes = String(argTime.getMinutes()).padStart(2, '0');
    setCurrentTime(`${hours}:${minutes}`);
  };



  const loadBusinessName = async () => {
    const { data } = await supabase
      .from('configuration')
      .select('business_name')
      .maybeSingle();
    if (data) {
      setBusinessName(data.business_name);
    }
  };

  const loadStats = async () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: salesToday } = await supabase
      .from('sales')
      .select('items')
      .gte('created_at', startOfToday.toISOString());

    const { data: salesMonth } = await supabase
      .from('sales')
      .select('items')
      .gte('created_at', startOfMonth.toISOString());

    const { data: allProducts } = await supabase.from('products').select('id, name');

    const productMap = new Map(allProducts?.map(p => [p.id, p.name]) || []);

    let lucesToday = 0;
    let lucesMonth = 0;
    let invitadosToday = 0;
    let invitadosMonth = 0;
    let paletasToday = 0;
    let paletasMonth = 0;

    const monthProductCounts: Record<string, { name: string; quantity: number }> = {};

    salesToday?.forEach((sale) => {
      if (Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const productName = (productMap.get(item.product_id) || item.product_name || '').toLowerCase();
          const quantity = item.quantity || 0;

          if (productName.includes('luz') || productName.includes('luces')) {
            lucesToday += quantity;
          }
          if (productName.includes('invitado') || productName.includes('invitados')) {
            invitadosToday += quantity;
          }
          if (productName.includes('paleta') || productName.includes('paletas') || productName.includes('alquiler')) {
            paletasToday += quantity;
          }
        });
      }
    });

    salesMonth?.forEach((sale) => {
      if (Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const productId = item.product_id;
          const productName = productMap.get(productId) || item.product_name || '';
          const productNameLower = productName.toLowerCase();
          const quantity = item.quantity || 0;

          if (productNameLower.includes('luz') || productNameLower.includes('luces')) {
            lucesMonth += quantity;
          }
          if (productNameLower.includes('invitado') || productNameLower.includes('invitados')) {
            invitadosMonth += quantity;
          }
          if (productNameLower.includes('paleta') || productNameLower.includes('paletas') || productNameLower.includes('alquiler')) {
            paletasMonth += quantity;
          }

          if (!monthProductCounts[productId]) {
            monthProductCounts[productId] = { name: productName, quantity: 0 };
          }
          monthProductCounts[productId].quantity += quantity;
        });
      }
    });

    const topProduct = Object.values(monthProductCounts).sort((a, b) => b.quantity - a.quantity)[0] || null;

    setStats({
      lucesToday,
      lucesMonth,
      invitadosToday,
      invitadosMonth,
      topProduct,
      paletasToday,
      paletasMonth,
    });
  };



  const menuItems = [
    { id: 'ventas' as View, label: 'Ventas', icon: ShoppingCart, color: 'from-emerald-500 to-teal-600' },
    { id: 'reservas' as View, label: 'Reservas', icon: CalendarDays, color: 'from-sky-500 to-blue-600' },
    { id: 'stock' as View, label: 'Inventario', icon: Package, color: 'from-blue-500 to-cyan-600' },
    { id: 'movimientos' as View, label: 'Movimientos', icon: Clock, color: 'from-teal-500 to-emerald-600' },
    { id: 'caja' as View, label: 'Caja', icon: Wallet, color: 'from-slate-600 to-slate-700' },
    { id: 'cuentacorriente' as View, label: 'Cta. Corriente', icon: BookOpen, color: 'from-amber-500 to-orange-600' },
    { id: 'compras' as View, label: 'Compras', icon: ShoppingBag, color: 'from-indigo-500 to-purple-600' },
    { id: 'socios' as View, label: 'Socios', icon: UserCheck, color: 'from-teal-500 to-cyan-600' },
    { id: 'reportes' as View, label: 'Reportes', icon: BarChart3, color: 'from-orange-500 to-red-600' },
    { id: 'configuracion' as View, label: 'Configuración', icon: Settings, color: 'from-gray-500 to-slate-600' },
  ];

  const currentItem = menuItems.find(item => item.id === currentView);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-lg border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-3 rounded-xl shadow-lg">
                <Store className="text-white" size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  {businessName}
                </h1>
                <p className="text-sm text-slate-600">ACTUALIZADO 15OCT2026</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <Clock size={16} className="text-slate-600" />
                  <p className="text-lg font-bold text-slate-800 font-mono">
                    {currentTime}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  {shift ? 'Turno Activo' : 'Sin turno activo'}
                </p>
                <p className="text-xs text-slate-500">
                  {shift ? `Usuario: ${shift.user_name}` : 'Usuario: -'}
                </p>
              </div>
              <div
                className={`w-3 h-3 rounded-full ${
                  shift ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              ></div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Tarjetas de estadísticas de ventas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400 rounded-xl shadow-lg p-2 text-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Lightbulb size={18} />
              </div>
              <h3 className="font-bold text-sm">Luces</h3>
            </div>
            <div className="grid grid-cols-2 gap-1 text-center">
              <div>
                <p className="text-lg font-bold">{stats.lucesToday}</p>
                <p className="text-[10px] opacity-90">Hoy</p>
              </div>
              <div>
                <p className="text-lg font-bold">{stats.lucesMonth}</p>
                <p className="text-[10px] opacity-90">Mes</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 rounded-xl shadow-lg p-2 text-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Users size={18} />
              </div>
              <h3 className="font-bold text-sm">Invitados</h3>
            </div>
            <div className="grid grid-cols-2 gap-1 text-center">
              <div>
                <p className="text-lg font-bold">{stats.invitadosToday}</p>
                <p className="text-[10px] opacity-90">Hoy</p>
              </div>
              <div>
                <p className="text-lg font-bold">{stats.invitadosMonth}</p>
                <p className="text-[10px] opacity-90">Mes</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 rounded-xl shadow-lg p-2 text-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <TrendingUp size={18} />
              </div>
              <h3 className="font-bold text-sm">Art + vendido</h3>
            </div>
            <div className="text-center">
              <p className="text-base font-bold truncate">
                {stats.topProduct?.name || 'N/A'}
              </p>
              <p className="text-lg font-bold">{stats.topProduct?.quantity || 0}</p>
              <p className="text-[10px] opacity-90">unidades</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-xl shadow-lg p-2 text-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Layers size={18} />
              </div>
              <h3 className="font-bold text-sm">Paletas</h3>
            </div>
            <div className="grid grid-cols-2 gap-1 text-center">
              <div>
                <p className="text-lg font-bold">{stats.paletasToday}</p>
                <p className="text-[10px] opacity-90">Hoy</p>
              </div>
              <div>
                <p className="text-lg font-bold">{stats.paletasMonth}</p>
                <p className="text-[10px] opacity-90">Mes</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-4 space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? `bg-gradient-to-r ${item.color} text-white shadow-lg scale-105`
                        : 'text-slate-600 hover:bg-slate-50 hover:scale-102'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="col-span-12 lg:col-span-10">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className={`bg-gradient-to-r ${currentItem?.color} p-6 text-white`}>
                <div className="flex items-center gap-3">
                  {currentItem && <currentItem.icon size={32} />}
                  <div>
                    <h2 className="text-2xl font-bold">{currentItem?.label}</h2>
                    <p className="text-white/80 text-sm">
                      Gestiona tus {currentItem?.label.toLowerCase()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {currentView === 'ventas' && <Ventas shift={shift} />}
                {currentView === 'stock' && <Stock />}
                {currentView === 'movimientos' && <Movimientos shift={shift} />}
                {currentView === 'caja' && <Caja shift={shift} onCloseShift={onCloseShift} />}
                {currentView === 'cuentacorriente' && <CuentaCorriente shift={shift} />}
                {currentView === 'compras' && <Compras shift={shift} />}
                {currentView === 'socios' && <Socios />}
                {currentView === 'reservas' && <Reservas shift={shift} />}
                {currentView === 'reportes' && <Reportes />}
                {currentView === 'configuracion' && <Configuracion />}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
