import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, FileText, DollarSign, Settings2, CreditCard as Edit2, Trash2, Pause, Play, UserPlus, X, Download, Printer, Share2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Barrio {
  id: string;
  name: string;
}

interface Socio {
  id: string;
  barrio_id: string;
  first_name: string;
  last_name: string;
  lot_number: string;
  dni: string;
  phone: string;
  email: string;
  category: string;
  carnet_status: string;
  created_at: string;
  updated_at: string;
  barrio?: Barrio;
}

interface CarnetPrices {
  id: string;
  individual_price: number;
  family_price: number;
  adherent_extra_price: number;
}

type ModalView = null | 'add' | 'edit' | 'prices' | 'report' | 'liquidation' | 'addFamily';

const CATEGORIES = [
  { value: 'titular', label: 'Titular' },
  { value: 'familiar_1', label: 'Familiar 1' },
  { value: 'familiar_2', label: 'Familiar 2' },
  { value: 'familiar_3', label: 'Familiar 3' },
  { value: 'familiar_adherente', label: 'Familiar Adherente' },
];

const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

export default function Socios() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [prices, setPrices] = useState<CarnetPrices | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalView, setModalView] = useState<ModalView>(null);
  const [editingSocio, setEditingSocio] = useState<Socio | null>(null);
  const [familyLot, setFamilyLot] = useState<string>('');
  const [familyBarrioId, setFamilyBarrioId] = useState<string>('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBarrio, setFilterBarrio] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Form state
  const [form, setForm] = useState({
    barrio_id: '',
    new_barrio: '',
    first_name: '',
    last_name: '',
    lot_number: '',
    dni: '',
    phone: '',
    email: '',
    category: 'titular',
    carnet_status: 'activo',
  });

  // Prices form
  const [pricesForm, setPricesForm] = useState({
    individual_price: '',
    family_price: '',
    adherent_extra_price: '',
  });

  // Report filters
  const [reportFilter, setReportFilter] = useState({
    barrio: '',
    category: '',
    status: '',
    sortBy: 'last_name',
  });

  // Liquidation filter
  const [liquidationBarrio, setLiquidationBarrio] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [sociosRes, barriosRes, pricesRes] = await Promise.all([
      supabase.from('socios').select('*, barrio:barrios(*)').order('last_name'),
      supabase.from('barrios').select('*').order('name'),
      supabase.from('carnet_prices').select('*').maybeSingle(),
    ]);
    setSocios((sociosRes.data || []) as Socio[]);
    setBarrios((barriosRes.data || []) as Barrio[]);
    if (pricesRes.data) setPrices(pricesRes.data as CarnetPrices);
    setLoading(false);
  };

  const filteredSocios = useMemo(() => {
    return socios.filter(s => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term ||
        s.first_name.toLowerCase().includes(term) ||
        s.last_name.toLowerCase().includes(term) ||
        s.lot_number.toLowerCase().includes(term) ||
        s.dni.toLowerCase().includes(term);
      const matchesBarrio = !filterBarrio || s.barrio_id === filterBarrio;
      const matchesCategory = !filterCategory || s.category === filterCategory;
      const matchesStatus = !filterStatus || s.carnet_status === filterStatus;
      return matchesSearch && matchesBarrio && matchesCategory && matchesStatus;
    });
  }, [socios, searchTerm, filterBarrio, filterCategory, filterStatus]);

  // Group socios by lot
  const lotGroups = useMemo(() => {
    const map = new Map<string, Socio[]>();
    filteredSocios.forEach(s => {
      const key = `${s.barrio_id}-${s.lot_number}`;
      const arr = map.get(key) || [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [filteredSocios]);

  const getSuggestedCategory = (barrioId: string, lotNumber: string): string => {
    const lotSocios = socios.filter(s => s.barrio_id === barrioId && s.lot_number === lotNumber);
    if (!lotSocios.find(s => s.category === 'familiar_1')) return 'familiar_1';
    if (!lotSocios.find(s => s.category === 'familiar_2')) return 'familiar_2';
    if (!lotSocios.find(s => s.category === 'familiar_3')) return 'familiar_3';
    return 'familiar_adherente';
  };

  const validateCategory = (category: string, barrioId: string, lotNumber: string, excludeId?: string): string | null => {
    const lotSocios = socios.filter(s =>
      s.barrio_id === barrioId && s.lot_number === lotNumber && s.id !== excludeId
    );
    if (category === 'titular' && lotSocios.find(s => s.category === 'titular')) {
      return 'Ya existe un Titular en este lote';
    }
    if (category === 'familiar_1' && lotSocios.find(s => s.category === 'familiar_1')) {
      return 'Ya existe un Familiar 1 en este lote';
    }
    if (category === 'familiar_2' && lotSocios.find(s => s.category === 'familiar_2')) {
      return 'Ya existe un Familiar 2 en este lote';
    }
    if (category === 'familiar_3' && lotSocios.find(s => s.category === 'familiar_3')) {
      return 'Ya existe un Familiar 3 en este lote';
    }
    return null;
  };

  const openAddModal = () => {
    setForm({
      barrio_id: '',
      new_barrio: '',
      first_name: '',
      last_name: '',
      lot_number: '',
      dni: '',
      phone: '',
      email: '',
      category: 'titular',
      carnet_status: 'activo',
    });
    setModalView('add');
  };

  const openEditModal = (socio: Socio) => {
    setEditingSocio(socio);
    setForm({
      barrio_id: socio.barrio_id,
      new_barrio: '',
      first_name: socio.first_name,
      last_name: socio.last_name,
      lot_number: socio.lot_number,
      dni: socio.dni,
      phone: socio.phone,
      email: socio.email,
      category: socio.category,
      carnet_status: socio.carnet_status,
    });
    setModalView('edit');
  };

  const openAddFamilyModal = (barrioId: string, lotNumber: string) => {
    const suggested = getSuggestedCategory(barrioId, lotNumber);
    setFamilyLot(lotNumber);
    setFamilyBarrioId(barrioId);
    setForm({
      barrio_id: barrioId,
      new_barrio: '',
      first_name: '',
      last_name: '',
      lot_number: lotNumber,
      dni: '',
      phone: '',
      email: '',
      category: suggested,
      carnet_status: 'activo',
    });
    setModalView('addFamily');
  };

  const openPricesModal = () => {
    if (prices) {
      setPricesForm({
        individual_price: String(prices.individual_price),
        family_price: String(prices.family_price),
        adherent_extra_price: String(prices.adherent_extra_price),
      });
    }
    setModalView('prices');
  };

  const handleSaveSocio = async (e: React.FormEvent) => {
    e.preventDefault();
    let barrioId = form.barrio_id;

    if (form.new_barrio.trim()) {
      const { data: newBarrio, error } = await supabase
        .from('barrios')
        .insert([{ name: form.new_barrio.trim() }])
        .select()
        .single();
      if (error) {
        alert('Error al crear barrio: ' + error.message);
        return;
      }
      barrioId = newBarrio.id;
    }

    if (!barrioId) {
      alert('Selecciona o crea un barrio');
      return;
    }

    const catError = validateCategory(form.category, barrioId, form.lot_number, editingSocio?.id);
    if (catError) {
      alert(catError);
      return;
    }

    if (modalView === 'edit' && editingSocio) {
      const { error } = await supabase
        .from('socios')
        .update({
          barrio_id: barrioId,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          lot_number: form.lot_number.trim(),
          dni: form.dni.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          category: form.category,
          carnet_status: form.carnet_status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingSocio.id);
      if (error) {
        alert('Error: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('socios')
        .insert([{
          barrio_id: barrioId,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          lot_number: form.lot_number.trim(),
          dni: form.dni.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          category: form.category,
          carnet_status: form.carnet_status,
        }]);
      if (error) {
        alert('Error: ' + error.message);
        return;
      }
    }

    setModalView(null);
    setEditingSocio(null);
    loadData();
  };

  const handleToggleStatus = async (socio: Socio) => {
    const newStatus = socio.carnet_status === 'activo' ? 'pausado' : 'activo';
    await supabase
      .from('socios')
      .update({ carnet_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', socio.id);
    loadData();
  };

  const handleDelete = async (socio: Socio) => {
    if (!confirm(`Eliminar a ${socio.first_name} ${socio.last_name}?`)) return;
    await supabase.from('socios').delete().eq('id', socio.id);
    loadData();
  };

  const handleSavePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prices) return;
    await supabase
      .from('carnet_prices')
      .update({
        individual_price: parseFloat(pricesForm.individual_price) || 0,
        family_price: parseFloat(pricesForm.family_price) || 0,
        adherent_extra_price: parseFloat(pricesForm.adherent_extra_price) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prices.id);
    setModalView(null);
    loadData();
  };

  // Calculate lot carnet cost
  const calcLotCost = (lotSocios: Socio[]): number => {
    if (!prices) return 0;
    const activeSocios = lotSocios.filter(s => s.carnet_status === 'activo');
    if (activeSocios.length === 0) return 0;

    const hasTitular = activeSocios.some(s => s.category === 'titular');
    if (!hasTitular) return 0;

    const hasFamilyMembers = activeSocios.some(s =>
      s.category === 'familiar_1' || s.category === 'familiar_2' || s.category === 'familiar_3'
    );
    const adherentCount = activeSocios.filter(s => s.category === 'familiar_adherente').length;

    let cost = hasFamilyMembers ? prices.family_price : prices.individual_price;
    cost += adherentCount * prices.adherent_extra_price;
    return cost;
  };

  // Report data
  const reportData = useMemo(() => {
    let data = [...socios];
    if (reportFilter.barrio) data = data.filter(s => s.barrio_id === reportFilter.barrio);
    if (reportFilter.category) {
      if (reportFilter.category === 'familiares') {
        data = data.filter(s => s.category.startsWith('familiar_') && s.category !== 'familiar_adherente');
      } else if (reportFilter.category === 'adherentes') {
        data = data.filter(s => s.category === 'familiar_adherente');
      } else {
        data = data.filter(s => s.category === reportFilter.category);
      }
    }
    if (reportFilter.status) data = data.filter(s => s.carnet_status === reportFilter.status);

    data.sort((a, b) => {
      switch (reportFilter.sortBy) {
        case 'barrio': return (a.barrio?.name || '').localeCompare(b.barrio?.name || '');
        case 'lot_number': return a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true });
        case 'category': return CATEGORIES.findIndex(c => c.value === a.category) - CATEGORIES.findIndex(c => c.value === b.category);
        default: return a.last_name.localeCompare(b.last_name);
      }
    });
    return data;
  }, [socios, reportFilter]);

  // Liquidation data
  const liquidationData = useMemo(() => {
    const allLots = new Map<string, { barrio: string; lot: string; socios: Socio[] }>();
    const filtered = liquidationBarrio ? socios.filter(s => s.barrio_id === liquidationBarrio) : socios;
    filtered.forEach(s => {
      const key = `${s.barrio_id}-${s.lot_number}`;
      if (!allLots.has(key)) {
        allLots.set(key, { barrio: s.barrio?.name || '', lot: s.lot_number, socios: [] });
      }
      allLots.get(key)!.socios.push(s);
    });

    const rows = Array.from(allLots.values())
      .map(g => ({ ...g, cost: calcLotCost(g.socios) }))
      .filter(g => g.cost > 0)
      .sort((a, b) => a.barrio.localeCompare(b.barrio) || a.lot.localeCompare(b.lot, undefined, { numeric: true }));
    return rows;
  }, [socios, liquidationBarrio, prices]);

  const liquidationTotal = useMemo(() => liquidationData.reduce((sum, r) => sum + r.cost, 0), [liquidationData]);

  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const exportReportCSV = () => {
    const headers = ['Barrio', 'Lote', 'Apellido', 'Nombre', 'DNI', 'Categoria', 'Estado'];
    const rows = reportData.map(s => [
      s.barrio?.name || '', s.lot_number, s.last_name, s.first_name, s.dni, categoryLabel(s.category), s.carnet_status
    ]);
    exportCSV(headers, rows, 'reporte_socios.csv');
  };

  const exportLiquidationCSV = () => {
    const headers = ['Barrio', 'Lote', 'Monto'];
    const rows = liquidationData.map(r => [r.barrio, r.lot, r.cost.toFixed(2)]);
    rows.push(['', 'TOTAL', liquidationTotal.toFixed(2)]);
    exportCSV(headers, rows, 'liquidacion_socios.csv');
  };

  const printReport = () => {
    const rowsHtml = reportData.map(s =>
      `<tr><td>${s.barrio?.name || ''}</td><td>${s.lot_number}</td><td>${s.last_name}</td><td>${s.first_name}</td><td>${s.dni}</td><td>${categoryLabel(s.category)}</td><td>${s.carnet_status}</td></tr>`
    ).join('');
    const html = `<html><head><title>Reporte Socios</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f1f5f9;font-weight:bold}</style></head><body><h2>Reporte de Socios</h2><table><thead><tr><th>Barrio</th><th>Lote</th><th>Apellido</th><th>Nombre</th><th>DNI</th><th>Categoria</th><th>Estado</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const printLiquidation = () => {
    const rowsHtml = liquidationData.map(r =>
      `<tr><td>${r.barrio}</td><td>${r.lot}</td><td>$${r.cost.toFixed(2)}</td></tr>`
    ).join('');
    const html = `<html><head><title>Liquidacion</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f1f5f9;font-weight:bold}tr.total td{font-weight:bold;background:#fef9c3}</style></head><body><h2>Liquidacion de Carnets</h2><table><thead><tr><th>Barrio</th><th>Lote</th><th>Monto</th></tr></thead><tbody>${rowsHtml}<tr class="total"><td></td><td>TOTAL</td><td>$${liquidationTotal.toFixed(2)}</td></tr></tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const shareReport = () => {
    const lines = [
      'REPORTE DE SOCIOS',
      '---',
      ...reportData.map(s => `${s.barrio?.name || ''} | Lote ${s.lot_number} | ${s.last_name}, ${s.first_name} | ${s.dni} | ${categoryLabel(s.category)} | ${s.carnet_status}`)
    ];
    if (navigator.share) {
      navigator.share({ title: 'Reporte Socios', text: lines.join('\n') });
    } else {
      navigator.clipboard.writeText(lines.join('\n'));
      alert('Copiado al portapapeles');
    }
  };

  const shareLiquidation = () => {
    const lines = [
      'LIQUIDACION DE CARNETS',
      '---',
      ...liquidationData.map(r => `${r.barrio} | Lote ${r.lot} | $${r.cost.toFixed(2)}`),
      `--- TOTAL: $${liquidationTotal.toFixed(2)}`
    ];
    if (navigator.share) {
      navigator.share({ title: 'Liquidacion', text: lines.join('\n') });
    } else {
      navigator.clipboard.writeText(lines.join('\n'));
      alert('Copiado al portapapeles');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={openAddModal} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <Plus size={18} /> Agregar Socio
        </button>
        <button onClick={() => setModalView('report')} className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <FileText size={18} /> Reporte
        </button>
        <button onClick={() => setModalView('liquidation')} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <DollarSign size={18} /> Liquidacion
        </button>
        <button onClick={openPricesModal} className="flex items-center gap-2 bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <Settings2 size={18} /> Precios Carnet
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, apellido, lote o DNI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter size={16} />
            Filtros
            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <select value={filterBarrio} onChange={e => setFilterBarrio(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">Todos los barrios</option>
              {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">Todas las categorias</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="pausado">Pausado</option>
            </select>
          </div>
        )}
      </div>

      {/* Socios list grouped by lot */}
      <div className="space-y-3">
        {filteredSocios.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p className="text-lg font-medium">No se encontraron socios</p>
            <p className="text-sm">Agrega un nuevo socio para comenzar</p>
          </div>
        )}

        {Array.from(lotGroups.entries()).map(([key, members]) => {
          const titular = members.find(m => m.category === 'titular');
          const barrio = members[0]?.barrio?.name || '';
          const lot = members[0]?.lot_number || '';
          const lotCost = calcLotCost(members);

          return (
            <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">{barrio}</span>
                  <span className="text-sm font-semibold text-slate-700">Lote {lot}</span>
                  {prices && lotCost > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">${lotCost.toFixed(2)}</span>
                  )}
                </div>
                {titular && (
                  <button
                    onClick={() => openAddFamilyModal(members[0].barrio_id, lot)}
                    className="flex items-center gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded transition-colors"
                  >
                    <UserPlus size={14} /> Agregar Familiar
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {members.sort((a, b) => CATEGORIES.findIndex(c => c.value === a.category) - CATEGORIES.findIndex(c => c.value === b.category)).map(socio => (
                  <div key={socio.id} className="px-4 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${socio.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {socio.carnet_status}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{socio.last_name}, {socio.first_name}</p>
                        <p className="text-xs text-slate-500">DNI: {socio.dni || '-'} | {categoryLabel(socio.category)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(socio)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => handleToggleStatus(socio)} className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title={socio.carnet_status === 'activo' ? 'Pausar' : 'Activar'}>
                        {socio.carnet_status === 'activo' ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button onClick={() => handleDelete(socio)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODALS */}
      {/* Add/Edit Socio Modal */}
      {(modalView === 'add' || modalView === 'edit' || modalView === 'addFamily') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {modalView === 'edit' ? 'Editar Socio' : modalView === 'addFamily' ? 'Agregar Familiar' : 'Agregar Socio'}
              </h3>
              <button onClick={() => { setModalView(null); setEditingSocio(null); }} className="p-1 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSocio} className="p-5 space-y-4">
              {/* Barrio */}
              {modalView !== 'addFamily' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Barrio *</label>
                  <select
                    value={form.barrio_id}
                    onChange={e => setForm({ ...form, barrio_id: e.target.value, new_barrio: '' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">Seleccionar barrio...</option>
                    {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="O escribe un nuevo barrio..."
                      value={form.new_barrio}
                      onChange={e => setForm({ ...form, new_barrio: e.target.value, barrio_id: '' })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Lot */}
              {modalView !== 'addFamily' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Numero de Lote *</label>
                  <input
                    type="text"
                    required
                    value={form.lot_number}
                    onChange={e => setForm({ ...form, lot_number: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              )}

              {modalView === 'addFamily' && (
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  Agregando familiar para Lote <strong>{familyLot}</strong> en <strong>{barrios.find(b => b.id === familyBarrioId)?.name}</strong>
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                  <input type="text" required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apellido *</label>
                  <input type="text" required value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
                  <input type="text" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                  <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo electronico</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {(modalView === 'add'
                      ? CATEGORIES
                      : CATEGORIES.filter(c => c.value !== 'titular')
                    ).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estado Carnet *</label>
                  <select value={form.carnet_status} onChange={e => setForm({ ...form, carnet_status: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="activo">Activo</option>
                    <option value="pausado">Pausado</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => { setModalView(null); setEditingSocio(null); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
                  {modalView === 'edit' ? 'Guardar Cambios' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Prices Modal */}
      {modalView === 'prices' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Configurar Precios Carnet</h3>
              <button onClick={() => setModalView(null)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleSavePrices} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Precio Carnet Individual</label>
                <input type="number" step="0.01" min="0" value={pricesForm.individual_price} onChange={e => setPricesForm({ ...pricesForm, individual_price: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <p className="text-xs text-slate-500 mt-1">Lote con solo un titular</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Precio Carnet Familiar</label>
                <input type="number" step="0.01" min="0" value={pricesForm.family_price} onChange={e => setPricesForm({ ...pricesForm, family_price: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <p className="text-xs text-slate-500 mt-1">Lote con titular + familiares no adherentes</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Precio Extra por Adherente</label>
                <input type="number" step="0.01" min="0" value={pricesForm.adherent_extra_price} onChange={e => setPricesForm({ ...pricesForm, adherent_extra_price: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <p className="text-xs text-slate-500 mt-1">Se suma por cada familiar adherente</p>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setModalView(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {modalView === 'report' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Reporte de Socios</h3>
              <div className="flex items-center gap-2">
                <button onClick={exportReportCSV} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Exportar CSV"><Download size={18} /></button>
                <button onClick={printReport} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Imprimir"><Printer size={18} /></button>
                <button onClick={shareReport} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Compartir"><Share2 size={18} /></button>
                <button onClick={() => setModalView(null)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <select value={reportFilter.barrio} onChange={e => setReportFilter({ ...reportFilter, barrio: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Todos los barrios</option>
                {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={reportFilter.category} onChange={e => setReportFilter({ ...reportFilter, category: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Todas las categorias</option>
                <option value="titular">Titulares</option>
                <option value="familiares">Familiares</option>
                <option value="adherentes">Adherentes</option>
              </select>
              <select value={reportFilter.status} onChange={e => setReportFilter({ ...reportFilter, status: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
              </select>
              <select value={reportFilter.sortBy} onChange={e => setReportFilter({ ...reportFilter, sortBy: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="last_name">Ordenar por Apellido</option>
                <option value="barrio">Ordenar por Barrio</option>
                <option value="lot_number">Ordenar por Lote</option>
                <option value="category">Ordenar por Categoria</option>
              </select>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Barrio</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Lote</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Apellido</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Nombre</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">DNI</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Categoria</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map(s => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3">{s.barrio?.name || ''}</td>
                      <td className="py-2 px-3">{s.lot_number}</td>
                      <td className="py-2 px-3 font-medium">{s.last_name}</td>
                      <td className="py-2 px-3">{s.first_name}</td>
                      <td className="py-2 px-3">{s.dni || '-'}</td>
                      <td className="py-2 px-3">{categoryLabel(s.category)}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {s.carnet_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length === 0 && <p className="text-center text-slate-500 py-8">No hay datos para mostrar</p>}
              <p className="text-xs text-slate-500 mt-3">Total: {reportData.length} socios</p>
            </div>
          </div>
        </div>
      )}

      {/* Liquidation Modal */}
      {modalView === 'liquidation' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Liquidacion de Carnets</h3>
              <div className="flex items-center gap-2">
                <button onClick={exportLiquidationCSV} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Exportar CSV"><Download size={18} /></button>
                <button onClick={printLiquidation} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Imprimir"><Printer size={18} /></button>
                <button onClick={shareLiquidation} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Compartir"><Share2 size={18} /></button>
                <button onClick={() => setModalView(null)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 border-b border-slate-200 flex items-center gap-4">
              <select value={liquidationBarrio} onChange={e => setLiquidationBarrio(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Todos los barrios</option>
                {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="ml-auto text-sm font-bold text-slate-700">
                Total: <span className="text-amber-600">${liquidationTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Barrio</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Lote</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidationData.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3">{r.barrio}</td>
                      <td className="py-2 px-3">{r.lot}</td>
                      <td className="py-2 px-3 text-right font-medium">${r.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                  {liquidationData.length > 0 && (
                    <tr className="bg-amber-50 font-bold">
                      <td className="py-2 px-3"></td>
                      <td className="py-2 px-3">TOTAL</td>
                      <td className="py-2 px-3 text-right text-amber-700">${liquidationTotal.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {liquidationData.length === 0 && <p className="text-center text-slate-500 py-8">No hay datos para mostrar. Configura los precios del carnet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
