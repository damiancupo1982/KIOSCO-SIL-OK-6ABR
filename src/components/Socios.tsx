import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, FileText, DollarSign, Settings2, Pause, Play, Ban, UserPlus, X, Download, Printer, Share2, ChevronDown, ChevronUp, Upload, History, Globe2, CreditCard as Edit3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SociosImporter from './SociosImporter';
import StatusChangeModal from './socios/StatusChangeModal';
import CarnetMovements from './socios/CarnetMovements';
import LiquidationModal from './socios/LiquidationModal';
import { calcExternoCost, calcLotCostDetailed } from './socios/carnetCalc';
import { Barrio, CarnetPrices, CarnetStatus, CATEGORIES, Socio, STATUS_BADGE, STATUS_LABEL, TipoSocio, categoryLabel, socioFullName } from './socios/types';

type ModalView = null | 'add' | 'edit' | 'prices' | 'report' | 'liquidation' | 'addFamily' | 'import' | 'movements';
type Tab = '' | TipoSocio;

const RPC_ERRORS: Record<string, string> = {
  same_status: 'El carnet ya tiene ese estado.',
  socio_not_found: 'No se encontro el socio.',
  invalid_status: 'Estado invalido.',
};

const lotLabel = (s: Socio) => (s.tipo_socio === 'EXTERNO' ? s.external_id || 'EXTERNO' : s.lot_number);

const emptyForm = {
  tipo_socio: 'INTERNO' as TipoSocio,
  barrio_id: '',
  new_barrio: '',
  first_name: '',
  last_name: '',
  lot_number: '',
  dni: '',
  phone: '',
  email: '',
  category: 'titular',
  carnet_status: 'activo' as CarnetStatus,
  tiene_tenis: false,
};

interface SociosProps {
  userName: string;
}

export default function Socios({ userName }: SociosProps) {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [prices, setPrices] = useState<CarnetPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [modalView, setModalView] = useState<ModalView>(null);
  const [editingSocio, setEditingSocio] = useState<Socio | null>(null);
  const [familyLot, setFamilyLot] = useState<string>('');
  const [familyBarrioId, setFamilyBarrioId] = useState<string>('');
  const [statusChange, setStatusChange] = useState<{ socio: Socio; target: CarnetStatus } | null>(null);
  const [movementsMonth, setMovementsMonth] = useState('');
  const [movementsFrom, setMovementsFrom] = useState<ModalView>(null);

  const [tab, setTab] = useState<Tab>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBarrio, setFilterBarrio] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTenis, setFilterTenis] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [form, setForm] = useState(emptyForm);

  const [pricesForm, setPricesForm] = useState({
    individual_price: '',
    family_price: '',
    adherent_extra_price: '',
  });

  const [reportFilter, setReportFilter] = useState({
    tipo: '',
    barrio: '',
    category: '',
    status: '',
    tenis: '',
    sortBy: 'last_name',
  });

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
    setLoadError(sociosRes.error ? 'No se pudieron cargar los socios. Intenta nuevamente.' : '');
    setSocios((sociosRes.data || []) as Socio[]);
    setBarrios((barriosRes.data || []) as Barrio[]);
    if (pricesRes.data) setPrices(pricesRes.data as CarnetPrices);
    setLoading(false);
  };

  const filteredSocios = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return socios.filter(s => {
      const matchesTab = !tab || s.tipo_socio === tab;
      const matchesSearch = !term ||
        s.first_name.toLowerCase().includes(term) ||
        s.last_name.toLowerCase().includes(term) ||
        socioFullName(s).toLowerCase().includes(term) ||
        (s.tipo_socio === 'INTERNO' && s.lot_number.toLowerCase().includes(term)) ||
        (s.external_id || '').toLowerCase().includes(term) ||
        s.dni.toLowerCase().includes(term);
      const matchesBarrio = !filterBarrio || s.barrio_id === filterBarrio;
      const matchesCategory = !filterCategory || s.category === filterCategory;
      const matchesStatus = !filterStatus || s.carnet_status === filterStatus;
      const matchesTenis = !filterTenis || (filterTenis === 'si' ? s.tiene_tenis : !s.tiene_tenis);
      return matchesTab && matchesSearch && matchesBarrio && matchesCategory && matchesStatus && matchesTenis;
    });
  }, [socios, tab, searchTerm, filterBarrio, filterCategory, filterStatus, filterTenis]);

  const lotGroups = useMemo(() => {
    const map = new Map<string, Socio[]>();
    filteredSocios.filter(s => s.tipo_socio === 'INTERNO').forEach(s => {
      const key = `${s.barrio_id}-${s.lot_number}`;
      const arr = map.get(key) || [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [filteredSocios]);

  const filteredExternos = useMemo(
    () => filteredSocios.filter(s => s.tipo_socio === 'EXTERNO').sort((a, b) => (a.external_id || '').localeCompare(b.external_id || '')),
    [filteredSocios]
  );

  const tabCounts = useMemo(() => ({
    all: socios.length,
    INTERNO: socios.filter(s => s.tipo_socio === 'INTERNO').length,
    EXTERNO: socios.filter(s => s.tipo_socio === 'EXTERNO').length,
  }), [socios]);

  const getSuggestedCategory = (barrioId: string, lotNumber: string): string => {
    const lotSocios = socios.filter(s => s.tipo_socio === 'INTERNO' && s.barrio_id === barrioId && s.lot_number === lotNumber);
    if (!lotSocios.find(s => s.category === 'familiar_1')) return 'familiar_1';
    if (!lotSocios.find(s => s.category === 'familiar_2')) return 'familiar_2';
    if (!lotSocios.find(s => s.category === 'familiar_3')) return 'familiar_3';
    return 'familiar_adherente';
  };

  const validateCategory = (category: string, barrioId: string, lotNumber: string, excludeId?: string): string | null => {
    const lotSocios = socios.filter(s =>
      s.tipo_socio === 'INTERNO' && s.carnet_status !== 'baja' &&
      s.barrio_id === barrioId && s.lot_number === lotNumber && s.id !== excludeId
    );
    if (category !== 'familiar_adherente' && lotSocios.find(s => s.category === category)) {
      return `Ya existe un ${categoryLabel(category)} en este lote`;
    }
    return null;
  };

  const closeForm = () => { setModalView(null); setEditingSocio(null); };

  const openAddModal = () => {
    setForm({ ...emptyForm, tipo_socio: tab === 'EXTERNO' ? 'EXTERNO' : 'INTERNO' });
    setModalView('add');
  };

  const openEditModal = (socio: Socio) => {
    setEditingSocio(socio);
    setForm({
      tipo_socio: socio.tipo_socio, barrio_id: socio.barrio_id || '', new_barrio: '', first_name: socio.first_name,
      last_name: socio.last_name, lot_number: socio.lot_number, dni: socio.dni, phone: socio.phone, email: socio.email,
      category: socio.category, carnet_status: socio.carnet_status, tiene_tenis: socio.tiene_tenis,
    });
    setModalView('edit');
  };

  const openAddFamilyModal = (barrioId: string, lotNumber: string) => {
    setFamilyLot(lotNumber);
    setFamilyBarrioId(barrioId);
    setForm({ ...emptyForm, barrio_id: barrioId, lot_number: lotNumber, category: getSuggestedCategory(barrioId, lotNumber) });
    setModalView('addFamily');
  };

  const openPricesModal = () => {
    if (prices) {
      setPricesForm({ individual_price: String(prices.individual_price), family_price: String(prices.family_price), adherent_extra_price: String(prices.adherent_extra_price) });
    }
    setModalView('prices');
  };

  const openMovements = (month: string) => {
    setMovementsFrom(modalView);
    setMovementsMonth(month);
    setModalView('movements');
  };

  const handleSaveSocio = async (e: React.FormEvent) => {
    e.preventDefault();
    const isExterno = form.tipo_socio === 'EXTERNO';
    let barrioId: string | null = null;
    const lotNumber = isExterno ? '' : form.lot_number.trim();

    if (!isExterno) {
      barrioId = form.barrio_id;
      if (form.new_barrio.trim()) {
        const { data: newBarrio, error } = await supabase.from('barrios').insert([{ name: form.new_barrio.trim() }]).select().single();
        if (error) { alert('Error al crear barrio: ' + error.message); return; }
        barrioId = newBarrio.id;
      }
      if (!barrioId) { alert('Selecciona o crea un barrio'); return; }
      if (!lotNumber) { alert('El numero de lote es obligatorio para socios SIL'); return; }
      const catError = validateCategory(form.category, barrioId, lotNumber, editingSocio?.id);
      if (catError) { alert(catError); return; }
    }

    const payload = {
      tipo_socio: form.tipo_socio,
      barrio_id: barrioId,
      lot_number: lotNumber,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      dni: form.dni.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      category: isExterno ? 'titular' : form.category,
      tiene_tenis: form.tiene_tenis,
    };

    if (modalView === 'edit' && editingSocio) {
      const { error } = await supabase.from('socios').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingSocio.id);
      if (error) { alert('Error: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('socios').insert([{ ...payload, carnet_status: form.carnet_status }]);
      if (error) { alert('Error: ' + error.message); return; }
    }

    closeForm();
    loadData();
  };

  const confirmStatusChange = async (reason: string) => {
    if (!statusChange) return;
    const { error } = await supabase.rpc('change_carnet_status', {
      p_socio_id: statusChange.socio.id,
      p_new_status: statusChange.target,
      p_reason: reason,
      p_user: userName,
    });
    if (error) {
      const key = Object.keys(RPC_ERRORS).find(k => error.message.includes(k));
      alert(key ? RPC_ERRORS[key] : 'No se pudo cambiar el estado del carnet.');
      return;
    }
    setStatusChange(null);
    loadData();
  };

  const handleSavePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prices) return;
    await supabase.from('carnet_prices').update({
      individual_price: parseFloat(pricesForm.individual_price) || 0,
      family_price: parseFloat(pricesForm.family_price) || 0,
      adherent_extra_price: parseFloat(pricesForm.adherent_extra_price) || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', prices.id);
    setModalView(null);
    loadData();
  };

  const reportData = useMemo(() => {
    let data = [...socios];
    if (reportFilter.tipo) data = data.filter(s => s.tipo_socio === reportFilter.tipo);
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
    if (reportFilter.tenis) data = data.filter(s => reportFilter.tenis === 'si' ? s.tiene_tenis : !s.tiene_tenis);

    data.sort((a, b) => {
      switch (reportFilter.sortBy) {
        case 'barrio': return (a.barrio?.name || '').localeCompare(b.barrio?.name || '');
        case 'lot_number': return lotLabel(a).localeCompare(lotLabel(b), undefined, { numeric: true });
        case 'category': return CATEGORIES.findIndex(c => c.value === a.category) - CATEGORIES.findIndex(c => c.value === b.category);
        default: return a.last_name.localeCompare(b.last_name);
      }
    });
    return data;
  }, [socios, reportFilter]);

  const reportRow = (s: Socio) => [
    s.tipo_socio, s.barrio?.name || '', lotLabel(s), s.last_name, s.first_name, s.dni,
    categoryLabel(s.category), STATUS_LABEL[s.carnet_status], s.tiene_tenis ? 'SI' : 'NO',
  ];
  const REPORT_HEADERS = ['Tipo', 'Barrio', 'Lote / ID', 'Apellido', 'Nombre', 'DNI', 'Categoria', 'Estado', 'Tenis'];

  const exportReportCSV = () => {
    const csv = [REPORT_HEADERS.join(';'), ...reportData.map(s => reportRow(s).join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reporte_socios.csv';
    link.click();
  };

  const printReport = () => {
    const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const rowsHtml = reportData.map(s => `<tr>${reportRow(s).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    const html = `<html><head><title>Reporte Socios</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f1f5f9;font-weight:bold}</style></head><body><h2>Reporte de Socios</h2><table><thead><tr>${REPORT_HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const shareReport = () => {
    const lines = ['REPORTE DE SOCIOS', '---', ...reportData.map(s => reportRow(s).join(' | '))];
    if (navigator.share) { navigator.share({ title: 'Reporte Socios', text: lines.join('\n') }); }
    else { navigator.clipboard.writeText(lines.join('\n')); alert('Copiado al portapapeles'); }
  };

  const stats = useMemo(() => {
    const allLots = new Map<string, Socio[]>();
    socios.filter(s => s.tipo_socio === 'INTERNO').forEach(s => {
      const key = `${s.barrio_id}-${s.lot_number}`;
      const arr = allLots.get(key) || [];
      arr.push(s);
      allLots.set(key, arr);
    });

    let carnetIndividual = 0;
    let carnetFamiliar = 0;
    let totalSil = 0;

    allLots.forEach(lotSocios => {
      const calc = calcLotCostDetailed(lotSocios, prices);
      if (calc.details.length === 0) return;
      const active = lotSocios.filter(s => s.carnet_status === 'activo');
      if (active.some(s => s.category === 'familiar_1' || s.category === 'familiar_2' || s.category === 'familiar_3')) carnetFamiliar++;
      else carnetIndividual++;
      totalSil += calc.total_final;
    });

    const externosActivos = socios.filter(s => s.tipo_socio === 'EXTERNO' && s.carnet_status === 'activo');
    const totalExternos = externosActivos.reduce((sum, s) => sum + calcExternoCost(s, prices).total_final, 0);

    return { totalSocios: socios.length, carnetIndividual, carnetFamiliar, externosActivos: externosActivos.length, totalSil, totalExternos };
  }, [socios, prices]);

  const money = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const renderSocioRow = (socio: Socio) => (
    <div key={socio.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors ${socio.carnet_status === 'baja' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[socio.carnet_status]}`}>
          {STATUS_LABEL[socio.carnet_status]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 flex flex-wrap items-center gap-1.5">
            <span>{socio.last_name}, {socio.first_name}</span>
            {socio.tipo_socio === 'EXTERNO' && (
              <>
                <span className="text-xs font-mono font-semibold text-slate-600">{socio.external_id}</span>
                <span className="text-[10px] font-bold tracking-wide bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">SOCIO EXTERNO</span>
              </>
            )}
            {socio.tiene_tenis && <span className="text-xs bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded font-medium">TENIS</span>}
          </p>
          <p className="text-xs text-slate-500">
            DNI: {socio.dni || '-'} | {socio.tipo_socio === 'EXTERNO' ? 'Carnet individual' : categoryLabel(socio.category)}
            {socio.carnet_status === 'activo' && ' | Carnet activo'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => openEditModal(socio)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar">
          <Edit3 size={15} />
        </button>
        {socio.carnet_status === 'activo' ? (
          <button onClick={() => setStatusChange({ socio, target: 'pausado' })} className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Pausar carnet">
            <Pause size={15} />
          </button>
        ) : (
          <button onClick={() => setStatusChange({ socio, target: 'activo' })} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Reactivar carnet">
            <Play size={15} />
          </button>
        )}
        {socio.carnet_status !== 'baja' && (
          <button onClick={() => setStatusChange({ socio, target: 'baja' })} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Dar de baja carnet">
            <Ban size={15} />
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  const isExternoForm = form.tipo_socio === 'EXTERNO';
  const TABS: { value: Tab; label: string; count: number }[] = [
    { value: '', label: 'Todos', count: tabCounts.all },
    { value: 'INTERNO', label: 'Socios SIL / Internos', count: tabCounts.INTERNO },
    { value: 'EXTERNO', label: 'Socios Externos', count: tabCounts.EXTERNO },
  ];

  return (
    <div className="space-y-4">
      {loadError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{loadError}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Socios Totales</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalSocios}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carnet Individual</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{stats.carnetIndividual}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carnet Familiar</p>
          <p className="text-2xl font-bold text-cyan-700 mt-1">{stats.carnetFamiliar}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-sky-200">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide">Externos Activos</p>
          <p className="text-2xl font-bold text-sky-700 mt-1">{stats.externosActivos}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-amber-200">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Total SIL</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{money(stats.totalSil)}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-sky-200">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide">Total Externos</p>
          <p className="text-xl font-bold text-sky-700 mt-1">{money(stats.totalExternos)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={openAddModal} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <Plus size={18} /> Agregar Socio
        </button>
        <button onClick={() => setModalView('import')} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <Upload size={18} /> Importar Excel
        </button>
        <button onClick={() => setModalView('report')} className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <FileText size={18} /> Reporte
        </button>
        <button onClick={() => setModalView('liquidation')} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <DollarSign size={18} /> Liquidacion
        </button>
        <button onClick={() => openMovements('')} className="flex items-center gap-2 bg-stone-700 hover:bg-stone-800 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <History size={18} /> Bajas y Pausas
        </button>
        <button onClick={openPricesModal} className="flex items-center gap-2 bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
          <Settings2 size={18} /> Precios Carnet
        </button>
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.value || 'all'}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.value ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label} <span className="ml-1 text-xs text-slate-400">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, apellido, DNI, lote o ID externo (EXT-0001)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter size={16} /> Filtros
            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
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
              <option value="baja">Dado de baja</option>
            </select>
            <select value={filterTenis} onChange={e => setFilterTenis(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">Tenis: Todos</option>
              <option value="si">Con tenis</option>
              <option value="no">Sin tenis</option>
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {filteredSocios.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p className="text-lg font-medium">No se encontraron socios</p>
            <p className="text-sm">Agrega un nuevo socio para comenzar</p>
          </div>
        )}

        {Array.from(lotGroups.entries()).map(([key, members]) => {
          const titular = members.find(m => m.category === 'titular' && m.carnet_status !== 'baja');
          const barrio = members[0]?.barrio?.name || '';
          const lot = members[0]?.lot_number || '';
          const calc = calcLotCostDetailed(members, prices);

          return (
            <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">{barrio}</span>
                  <span className="text-sm font-semibold text-slate-700">Lote {lot}</span>
                  {prices && calc.total_final > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      ${calc.total_final.toFixed(2)}
                      {calc.total_descuento > 0 && <span className="text-emerald-600 ml-1">(-${calc.total_descuento.toFixed(2)})</span>}
                    </span>
                  )}
                </div>
                {titular && members[0].barrio_id && (
                  <button onClick={() => openAddFamilyModal(members[0].barrio_id!, lot)} className="flex items-center gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded transition-colors">
                    <UserPlus size={14} /> Agregar Familiar
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {[...members]
                  .sort((a, b) => CATEGORIES.findIndex(c => c.value === a.category) - CATEGORIES.findIndex(c => c.value === b.category))
                  .map(renderSocioRow)}
              </div>
            </div>
          );
        })}

        {filteredExternos.length > 0 && (
          <div className="border border-sky-200 rounded-xl overflow-hidden">
            <div className="bg-sky-50 px-4 py-2 flex items-center gap-2 border-b border-sky-200">
              <Globe2 size={16} className="text-sky-700" />
              <span className="text-sm font-semibold text-sky-800">Socios Externos</span>
              <span className="text-xs text-sky-600">Sin lote - no se liquidan al barrio</span>
            </div>
            <div className="divide-y divide-slate-100">{filteredExternos.map(renderSocioRow)}</div>
          </div>
        )}
      </div>

      {(modalView === 'add' || modalView === 'edit' || modalView === 'addFamily') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {modalView === 'edit' ? 'Editar Socio' : modalView === 'addFamily' ? 'Agregar Familiar' : 'Agregar Socio'}
              </h3>
              <button onClick={closeForm} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveSocio} className="p-5 space-y-4">
              {modalView !== 'addFamily' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de socio *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['INTERNO', 'EXTERNO'] as TipoSocio[]).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, tipo_socio: t })}
                        className={`px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${form.tipo_socio === t ? (t === 'INTERNO' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-sky-500 bg-sky-50 text-sky-800') : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        {t === 'INTERNO' ? 'Interno (SIL)' : 'Externo'}
                      </button>
                    ))}
                  </div>
                  {isExternoForm && (
                    <p className="text-xs text-sky-700 mt-2">
                      {editingSocio?.external_id ? `ID externo: ${editingSocio.external_id}. ` : 'Se le asignara un ID automatico (EXT-0001...). '}
                      Sin lote y no se liquida al barrio.
                    </p>
                  )}
                </div>
              )}

              {modalView !== 'addFamily' && !isExternoForm && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Barrio *</label>
                    <select value={form.barrio_id} onChange={e => setForm({ ...form, barrio_id: e.target.value, new_barrio: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      <option value="">Seleccionar barrio...</option>
                      {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <input type="text" placeholder="O escribe un nuevo barrio..." value={form.new_barrio} onChange={e => setForm({ ...form, new_barrio: e.target.value, barrio_id: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Numero de Lote *</label>
                    <input type="text" required value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  </div>
                </>
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
                {!isExternoForm && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoria *</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      {(modalView === 'addFamily' ? CATEGORIES.filter(c => c.value !== 'titular') : CATEGORIES).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                {modalView !== 'edit' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado Carnet *</label>
                    <select value={form.carnet_status} onChange={e => setForm({ ...form, carnet_status: e.target.value as CarnetStatus })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                      <option value="activo">Activo</option>
                      <option value="pausado">Pausado</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <p className="block text-sm font-medium text-slate-700 mb-1">Estado Carnet</p>
                    <span className={`inline-block text-xs font-medium px-2 py-1 rounded ${STATUS_BADGE[form.carnet_status]}`}>{STATUS_LABEL[form.carnet_status]}</span>
                    <p className="text-[11px] text-slate-500 mt-1">Se cambia con los botones Pausar / Baja / Reactivar</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.tiene_tenis}
                    onChange={e => setForm({ ...form, tiene_tenis: e.target.checked })}
                    className="w-4 h-4 text-cyan-600 border-slate-300 rounded focus:ring-cyan-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Tiene carnet de tenis</span>
                </label>
                <span className="text-xs text-cyan-600">{isExternoForm ? '(sin descuento para externos)' : '(30% descuento)'}</span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
                  {modalView === 'edit' ? 'Guardar Cambios' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <p className="text-xs text-slate-500 mt-1">Lote con solo un titular, y cada socio externo</p>
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
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                <p className="text-xs text-cyan-700 font-medium">Descuento tenis: 30% aplicado individualmente a cada socio SIL que tenga carnet de tenis. Los socios externos no tienen descuento.</p>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setModalView(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            <div className="p-4 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-6 gap-3">
              <select value={reportFilter.tipo} onChange={e => setReportFilter({ ...reportFilter, tipo: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Internos y externos</option>
                <option value="INTERNO">Internos (SIL)</option>
                <option value="EXTERNO">Externos</option>
              </select>
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
                <option value="baja">Dado de baja</option>
              </select>
              <select value={reportFilter.tenis} onChange={e => setReportFilter({ ...reportFilter, tenis: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Tenis: Todos</option>
                <option value="si">Con tenis</option>
                <option value="no">Sin tenis</option>
              </select>
              <select value={reportFilter.sortBy} onChange={e => setReportFilter({ ...reportFilter, sortBy: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="last_name">Ordenar: Apellido</option>
                <option value="barrio">Ordenar: Barrio</option>
                <option value="lot_number">Ordenar: Lote / ID</option>
                <option value="category">Ordenar: Categoria</option>
              </select>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {REPORT_HEADERS.map(h => <th key={h} className="text-left py-2 px-2 font-semibold text-slate-600">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map(s => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.tipo_socio === 'EXTERNO' ? 'bg-sky-100 text-sky-700' : 'bg-teal-100 text-teal-700'}`}>{s.tipo_socio}</span>
                      </td>
                      <td className="py-2 px-2">{s.barrio?.name || '-'}</td>
                      <td className="py-2 px-2">{lotLabel(s)}</td>
                      <td className="py-2 px-2 font-medium">{s.last_name}</td>
                      <td className="py-2 px-2">{s.first_name}</td>
                      <td className="py-2 px-2">{s.dni || '-'}</td>
                      <td className="py-2 px-2">{categoryLabel(s.category)}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[s.carnet_status]}`}>{STATUS_LABEL[s.carnet_status]}</span>
                      </td>
                      <td className="py-2 px-2">
                        {s.tiene_tenis ? <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded font-medium">SI</span> : <span className="text-xs text-slate-400">NO</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length === 0 && <p className="text-center text-slate-500 py-8">No hay datos para mostrar</p>}
              <p className="text-xs text-slate-500 mt-3">Total: {reportData.length} socios | Con tenis: {reportData.filter(s => s.tiene_tenis).length}</p>
            </div>
          </div>
        </div>
      )}

      {modalView === 'liquidation' && (
        <LiquidationModal
          socios={socios}
          barrios={barrios}
          prices={prices}
          onClose={() => setModalView(null)}
          onShowMovements={openMovements}
        />
      )}

      {modalView === 'movements' && (
        <CarnetMovements
          initialMonth={movementsMonth}
          onClose={() => setModalView(movementsFrom === 'liquidation' ? 'liquidation' : null)}
        />
      )}

      {modalView === 'import' && (
        <SociosImporter
          barrios={barrios}
          onClose={() => setModalView(null)}
          onImportComplete={loadData}
        />
      )}

      {statusChange && (
        <StatusChangeModal
          socio={statusChange.socio}
          target={statusChange.target}
          onClose={() => setStatusChange(null)}
          onConfirm={confirmStatusChange}
        />
      )}
    </div>
  );
}
