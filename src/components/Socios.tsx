import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, FileText, DollarSign, Settings2, Trash2, Pause, Play, UserPlus, X, Download, Printer, Share2, ChevronDown, ChevronUp, Upload, CreditCard as Edit3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SociosImporter from './SociosImporter';

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
  tiene_tenis: boolean;
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

type ModalView = null | 'add' | 'edit' | 'prices' | 'report' | 'liquidation' | 'addFamily' | 'import';

const CATEGORIES = [
  { value: 'titular', label: 'Titular' },
  { value: 'familiar_1', label: 'Familiar 1' },
  { value: 'familiar_2', label: 'Familiar 2' },
  { value: 'familiar_3', label: 'Familiar 3' },
  { value: 'familiar_adherente', label: 'Familiar Adherente' },
];

const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

const TENNIS_DISCOUNT = 0.20;

export default function Socios() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [barrios, setBarrios] = useState<Barrio[]>([]);
  const [prices, setPrices] = useState<CarnetPrices | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalView, setModalView] = useState<ModalView>(null);
  const [editingSocio, setEditingSocio] = useState<Socio | null>(null);
  const [familyLot, setFamilyLot] = useState<string>('');
  const [familyBarrioId, setFamilyBarrioId] = useState<string>('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterBarrio, setFilterBarrio] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTenis, setFilterTenis] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
    tiene_tenis: false,
  });

  const [pricesForm, setPricesForm] = useState({
    individual_price: '',
    family_price: '',
    adherent_extra_price: '',
  });

  const [reportFilter, setReportFilter] = useState({
    barrio: '',
    category: '',
    status: '',
    tenis: '',
    sortBy: 'last_name',
  });

  const [liquidationBarrio, setLiquidationBarrio] = useState('');
  const [expandedLot, setExpandedLot] = useState<string | null>(null);

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
      const matchesTenis = !filterTenis || (filterTenis === 'si' ? s.tiene_tenis : !s.tiene_tenis);
      return matchesSearch && matchesBarrio && matchesCategory && matchesStatus && matchesTenis;
    });
  }, [socios, searchTerm, filterBarrio, filterCategory, filterStatus, filterTenis]);

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
    if (category === 'titular' && lotSocios.find(s => s.category === 'titular')) return 'Ya existe un Titular en este lote';
    if (category === 'familiar_1' && lotSocios.find(s => s.category === 'familiar_1')) return 'Ya existe un Familiar 1 en este lote';
    if (category === 'familiar_2' && lotSocios.find(s => s.category === 'familiar_2')) return 'Ya existe un Familiar 2 en este lote';
    if (category === 'familiar_3' && lotSocios.find(s => s.category === 'familiar_3')) return 'Ya existe un Familiar 3 en este lote';
    return null;
  };

  const openAddModal = () => {
    setForm({ barrio_id: '', new_barrio: '', first_name: '', last_name: '', lot_number: '', dni: '', phone: '', email: '', category: 'titular', carnet_status: 'activo', tiene_tenis: false });
    setModalView('add');
  };

  const openEditModal = (socio: Socio) => {
    setEditingSocio(socio);
    setForm({ barrio_id: socio.barrio_id, new_barrio: '', first_name: socio.first_name, last_name: socio.last_name, lot_number: socio.lot_number, dni: socio.dni, phone: socio.phone, email: socio.email, category: socio.category, carnet_status: socio.carnet_status, tiene_tenis: socio.tiene_tenis });
    setModalView('edit');
  };

  const openAddFamilyModal = (barrioId: string, lotNumber: string) => {
    const suggested = getSuggestedCategory(barrioId, lotNumber);
    setFamilyLot(lotNumber);
    setFamilyBarrioId(barrioId);
    setForm({ barrio_id: barrioId, new_barrio: '', first_name: '', last_name: '', lot_number: lotNumber, dni: '', phone: '', email: '', category: suggested, carnet_status: 'activo', tiene_tenis: false });
    setModalView('addFamily');
  };

  const openPricesModal = () => {
    if (prices) {
      setPricesForm({ individual_price: String(prices.individual_price), family_price: String(prices.family_price), adherent_extra_price: String(prices.adherent_extra_price) });
    }
    setModalView('prices');
  };

  const handleSaveSocio = async (e: React.FormEvent) => {
    e.preventDefault();
    let barrioId = form.barrio_id;

    if (form.new_barrio.trim()) {
      const { data: newBarrio, error } = await supabase.from('barrios').insert([{ name: form.new_barrio.trim() }]).select().single();
      if (error) { alert('Error al crear barrio: ' + error.message); return; }
      barrioId = newBarrio.id;
    }

    if (!barrioId) { alert('Selecciona o crea un barrio'); return; }

    const catError = validateCategory(form.category, barrioId, form.lot_number, editingSocio?.id);
    if (catError) { alert(catError); return; }

    if (modalView === 'edit' && editingSocio) {
      const { error } = await supabase.from('socios').update({
        barrio_id: barrioId, first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        lot_number: form.lot_number.trim(), dni: form.dni.trim(), phone: form.phone.trim(),
        email: form.email.trim(), category: form.category, carnet_status: form.carnet_status,
        tiene_tenis: form.tiene_tenis, updated_at: new Date().toISOString(),
      }).eq('id', editingSocio.id);
      if (error) { alert('Error: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('socios').insert([{
        barrio_id: barrioId, first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        lot_number: form.lot_number.trim(), dni: form.dni.trim(), phone: form.phone.trim(),
        email: form.email.trim(), category: form.category, carnet_status: form.carnet_status,
        tiene_tenis: form.tiene_tenis,
      }]);
      if (error) { alert('Error: ' + error.message); return; }
    }

    setModalView(null);
    setEditingSocio(null);
    loadData();
  };

  const handleToggleStatus = async (socio: Socio) => {
    const newStatus = socio.carnet_status === 'activo' ? 'pausado' : 'activo';
    await supabase.from('socios').update({ carnet_status: newStatus, updated_at: new Date().toISOString() }).eq('id', socio.id);
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
    await supabase.from('carnet_prices').update({
      individual_price: parseFloat(pricesForm.individual_price) || 0,
      family_price: parseFloat(pricesForm.family_price) || 0,
      adherent_extra_price: parseFloat(pricesForm.adherent_extra_price) || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', prices.id);
    setModalView(null);
    loadData();
  };

  // Calculate lot carnet cost with tennis discount detail
  interface LotCalcDetail {
    socio_name: string;
    category: string;
    base_price: number;
    discount: number;
    final_price: number;
    tiene_tenis: boolean;
  }

  interface LotCalcResult {
    total_bruto: number;
    total_descuento: number;
    total_final: number;
    details: LotCalcDetail[];
  }

  const calcLotCostDetailed = (lotSocios: Socio[]): LotCalcResult => {
    if (!prices) return { total_bruto: 0, total_descuento: 0, total_final: 0, details: [] };
    const activeSocios = lotSocios.filter(s => s.carnet_status === 'activo');
    if (activeSocios.length === 0) return { total_bruto: 0, total_descuento: 0, total_final: 0, details: [] };

    const titular = activeSocios.find(s => s.category === 'titular');
    if (!titular) return { total_bruto: 0, total_descuento: 0, total_final: 0, details: [] };

    const hasFamilyMembers = activeSocios.some(s =>
      s.category === 'familiar_1' || s.category === 'familiar_2' || s.category === 'familiar_3'
    );
    const adherents = activeSocios.filter(s => s.category === 'familiar_adherente');

    const basePrice = hasFamilyMembers ? prices.family_price : prices.individual_price;
    const details: LotCalcDetail[] = [];

    // The main carnet price applies to the titular and family members as a group
    // Discount is per-person: if titular has tennis, discount on the base carnet
    // For family carnet, we split the concept: the base covers titular + fam 1/2/3
    // Tennis discount: each person with tennis gets 20% off their share

    if (!hasFamilyMembers) {
      // Individual carnet - only titular
      const discount = titular.tiene_tenis ? basePrice * TENNIS_DISCOUNT : 0;
      details.push({
        socio_name: `${titular.last_name}, ${titular.first_name}`,
        category: 'titular',
        base_price: basePrice,
        discount,
        final_price: basePrice - discount,
        tiene_tenis: titular.tiene_tenis,
      });
    } else {
      // Family carnet - base covers the group (titular + fam 1/2/3)
      const familyGroup = activeSocios.filter(s =>
        s.category === 'titular' || s.category === 'familiar_1' || s.category === 'familiar_2' || s.category === 'familiar_3'
      );
      const tenisInGroup = familyGroup.filter(s => s.tiene_tenis).length;
      // Proportional discount: each member with tennis contributes 20% of their share
      const sharePerMember = basePrice / familyGroup.length;
      const groupDiscount = tenisInGroup * sharePerMember * TENNIS_DISCOUNT;

      for (const member of familyGroup) {
        const memberShare = sharePerMember;
        const memberDiscount = member.tiene_tenis ? memberShare * TENNIS_DISCOUNT : 0;
        details.push({
          socio_name: `${member.last_name}, ${member.first_name}`,
          category: member.category,
          base_price: memberShare,
          discount: memberDiscount,
          final_price: memberShare - memberDiscount,
          tiene_tenis: member.tiene_tenis,
        });
      }
    }

    // Adherents
    for (const adh of adherents) {
      const adhPrice = prices.adherent_extra_price;
      const discount = adh.tiene_tenis ? adhPrice * TENNIS_DISCOUNT : 0;
      details.push({
        socio_name: `${adh.last_name}, ${adh.first_name}`,
        category: 'familiar_adherente',
        base_price: adhPrice,
        discount,
        final_price: adhPrice - discount,
        tiene_tenis: adh.tiene_tenis,
      });
    }

    const total_bruto = details.reduce((s, d) => s + d.base_price, 0);
    const total_descuento = details.reduce((s, d) => s + d.discount, 0);
    const total_final = details.reduce((s, d) => s + d.final_price, 0);

    return { total_bruto, total_descuento, total_final, details };
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
    if (reportFilter.tenis) data = data.filter(s => reportFilter.tenis === 'si' ? s.tiene_tenis : !s.tiene_tenis);

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
      .map(g => ({ ...g, calc: calcLotCostDetailed(g.socios) }))
      .filter(g => g.calc.total_final > 0)
      .sort((a, b) => a.barrio.localeCompare(b.barrio) || a.lot.localeCompare(b.lot, undefined, { numeric: true }));
    return rows;
  }, [socios, liquidationBarrio, prices]);

  const liquidationTotals = useMemo(() => ({
    bruto: liquidationData.reduce((s, r) => s + r.calc.total_bruto, 0),
    descuento: liquidationData.reduce((s, r) => s + r.calc.total_descuento, 0),
    final: liquidationData.reduce((s, r) => s + r.calc.total_final, 0),
  }), [liquidationData]);

  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const exportReportCSV = () => {
    const headers = ['Barrio', 'Lote', 'Apellido', 'Nombre', 'DNI', 'Categoria', 'Estado', 'Tenis'];
    const rows = reportData.map(s => [
      s.barrio?.name || '', s.lot_number, s.last_name, s.first_name, s.dni, categoryLabel(s.category), s.carnet_status, s.tiene_tenis ? 'SI' : 'NO'
    ]);
    exportCSV(headers, rows, 'reporte_socios.csv');
  };

  const exportLiquidationCSV = () => {
    const headers = ['Barrio', 'Lote', 'Monto Bruto', 'Descuento Tenis', 'Monto Final'];
    const rows = liquidationData.map(r => [r.barrio, r.lot, r.calc.total_bruto.toFixed(2), r.calc.total_descuento.toFixed(2), r.calc.total_final.toFixed(2)]);
    rows.push(['', 'TOTAL', liquidationTotals.bruto.toFixed(2), liquidationTotals.descuento.toFixed(2), liquidationTotals.final.toFixed(2)]);
    exportCSV(headers, rows, 'liquidacion_socios.csv');
  };

  const printReport = () => {
    const rowsHtml = reportData.map(s =>
      `<tr><td>${s.barrio?.name || ''}</td><td>${s.lot_number}</td><td>${s.last_name}</td><td>${s.first_name}</td><td>${s.dni}</td><td>${categoryLabel(s.category)}</td><td>${s.carnet_status}</td><td>${s.tiene_tenis ? 'SI' : 'NO'}</td></tr>`
    ).join('');
    const html = `<html><head><title>Reporte Socios</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f1f5f9;font-weight:bold}</style></head><body><h2>Reporte de Socios</h2><table><thead><tr><th>Barrio</th><th>Lote</th><th>Apellido</th><th>Nombre</th><th>DNI</th><th>Categoria</th><th>Estado</th><th>Tenis</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const printLiquidation = () => {
    const rowsHtml = liquidationData.map(r =>
      `<tr><td>${r.barrio}</td><td>${r.lot}</td><td>$${r.calc.total_bruto.toFixed(2)}</td><td>$${r.calc.total_descuento.toFixed(2)}</td><td>$${r.calc.total_final.toFixed(2)}</td></tr>`
    ).join('');
    const html = `<html><head><title>Liquidacion</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f1f5f9;font-weight:bold}tr.total td{font-weight:bold;background:#fef9c3}</style></head><body><h2>Liquidacion de Carnets</h2><table><thead><tr><th>Barrio</th><th>Lote</th><th>Bruto</th><th>Desc. Tenis</th><th>Final</th></tr></thead><tbody>${rowsHtml}<tr class="total"><td></td><td>TOTAL</td><td>$${liquidationTotals.bruto.toFixed(2)}</td><td>$${liquidationTotals.descuento.toFixed(2)}</td><td>$${liquidationTotals.final.toFixed(2)}</td></tr></tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const shareReport = () => {
    const lines = [
      'REPORTE DE SOCIOS', '---',
      ...reportData.map(s => `${s.barrio?.name || ''} | Lote ${s.lot_number} | ${s.last_name}, ${s.first_name} | ${s.dni} | ${categoryLabel(s.category)} | ${s.carnet_status} | Tenis: ${s.tiene_tenis ? 'SI' : 'NO'}`)
    ];
    if (navigator.share) { navigator.share({ title: 'Reporte Socios', text: lines.join('\n') }); }
    else { navigator.clipboard.writeText(lines.join('\n')); alert('Copiado al portapapeles'); }
  };

  const shareLiquidation = () => {
    const lines = [
      'LIQUIDACION DE CARNETS', '---',
      ...liquidationData.map(r => `${r.barrio} | Lote ${r.lot} | Bruto: $${r.calc.total_bruto.toFixed(2)} | Desc: $${r.calc.total_descuento.toFixed(2)} | Final: $${r.calc.total_final.toFixed(2)}`),
      `--- TOTAL: Bruto $${liquidationTotals.bruto.toFixed(2)} | Desc $${liquidationTotals.descuento.toFixed(2)} | Final $${liquidationTotals.final.toFixed(2)}`
    ];
    if (navigator.share) { navigator.share({ title: 'Liquidacion', text: lines.join('\n') }); }
    else { navigator.clipboard.writeText(lines.join('\n')); alert('Copiado al portapapeles'); }
  };

  // Statistics cards data
  const stats = useMemo(() => {
    const allLots = new Map<string, Socio[]>();
    socios.forEach(s => {
      const key = `${s.barrio_id}-${s.lot_number}`;
      const arr = allLots.get(key) || [];
      arr.push(s);
      allLots.set(key, arr);
    });

    let totalCarnets = 0;
    let carnetIndividual = 0;
    let carnetFamiliar = 0;
    let totalLiquidar = 0;

    allLots.forEach(lotSocios => {
      const active = lotSocios.filter(s => s.carnet_status === 'activo');
      const hasTitular = active.some(s => s.category === 'titular');
      if (!hasTitular) return;

      totalCarnets++;
      const hasFamily = active.some(s =>
        s.category === 'familiar_1' || s.category === 'familiar_2' || s.category === 'familiar_3'
      );
      if (hasFamily) carnetFamiliar++;
      else carnetIndividual++;

      const calc = calcLotCostDetailed(lotSocios);
      totalLiquidar += calc.total_final;
    });

    return { totalSocios: socios.length, totalCarnets, carnetIndividual, carnetFamiliar, totalLiquidar };
  }, [socios, prices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Socios Totales</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalSocios}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carnets Totales</p>
          <p className="text-2xl font-bold text-teal-700 mt-1">{stats.totalCarnets}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carnet Individual</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{stats.carnetIndividual}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carnet Familiar</p>
          <p className="text-2xl font-bold text-cyan-700 mt-1">{stats.carnetFamiliar}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow border border-amber-200">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Total $ a Liquidar</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">${stats.totalLiquidar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Top bar */}
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
            </select>
            <select value={filterTenis} onChange={e => setFilterTenis(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">Tenis: Todos</option>
              <option value="si">Con tenis</option>
              <option value="no">Sin tenis</option>
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
          const calc = calcLotCostDetailed(members);

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
                {titular && (
                  <button onClick={() => openAddFamilyModal(members[0].barrio_id, lot)} className="flex items-center gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded transition-colors">
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
                        <p className="text-sm font-medium text-slate-800">
                          {socio.last_name}, {socio.first_name}
                          {socio.tiene_tenis && <span className="ml-2 text-xs bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded font-medium">TENIS</span>}
                        </p>
                        <p className="text-xs text-slate-500">DNI: {socio.dni || '-'} | {categoryLabel(socio.category)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(socio)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar">
                        <Edit3 size={15} />
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

      {/* Add/Edit Socio Modal */}
      {(modalView === 'add' || modalView === 'edit' || modalView === 'addFamily') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {modalView === 'edit' ? 'Editar Socio' : modalView === 'addFamily' ? 'Agregar Familiar' : 'Agregar Socio'}
              </h3>
              <button onClick={() => { setModalView(null); setEditingSocio(null); }} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveSocio} className="p-5 space-y-4">
              {modalView !== 'addFamily' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Barrio *</label>
                  <select value={form.barrio_id} onChange={e => setForm({ ...form, barrio_id: e.target.value, new_barrio: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">Seleccionar barrio...</option>
                    {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <input type="text" placeholder="O escribe un nuevo barrio..." value={form.new_barrio} onChange={e => setForm({ ...form, new_barrio: e.target.value, barrio_id: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-2" />
                </div>
              )}

              {modalView !== 'addFamily' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Numero de Lote *</label>
                  <input type="text" required value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
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
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {(modalView === 'add' ? CATEGORIES : CATEGORIES.filter(c => c.value !== 'titular')).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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

              {/* Tennis field */}
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
                <span className="text-xs text-cyan-600">(20% descuento)</span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => { setModalView(null); setEditingSocio(null); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
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
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                <p className="text-xs text-cyan-700 font-medium">Descuento tenis: 20% aplicado individualmente a cada socio que tenga carnet de tenis</p>
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
            <div className="p-4 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-3">
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
              <select value={reportFilter.tenis} onChange={e => setReportFilter({ ...reportFilter, tenis: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Tenis: Todos</option>
                <option value="si">Con tenis</option>
                <option value="no">Sin tenis</option>
              </select>
              <select value={reportFilter.sortBy} onChange={e => setReportFilter({ ...reportFilter, sortBy: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="last_name">Ordenar: Apellido</option>
                <option value="barrio">Ordenar: Barrio</option>
                <option value="lot_number">Ordenar: Lote</option>
                <option value="category">Ordenar: Categoria</option>
              </select>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Barrio</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Lote</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Apellido</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Nombre</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">DNI</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Categoria</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Estado</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-600">Tenis</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map(s => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-2">{s.barrio?.name || ''}</td>
                      <td className="py-2 px-2">{s.lot_number}</td>
                      <td className="py-2 px-2 font-medium">{s.last_name}</td>
                      <td className="py-2 px-2">{s.first_name}</td>
                      <td className="py-2 px-2">{s.dni || '-'}</td>
                      <td className="py-2 px-2">{categoryLabel(s.category)}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.carnet_status === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.carnet_status}</span>
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

      {/* Liquidation Modal */}
      {modalView === 'liquidation' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Liquidacion de Carnets</h3>
              <div className="flex items-center gap-2">
                <button onClick={exportLiquidationCSV} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Exportar CSV"><Download size={18} /></button>
                <button onClick={printLiquidation} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Imprimir"><Printer size={18} /></button>
                <button onClick={shareLiquidation} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Compartir"><Share2 size={18} /></button>
                <button onClick={() => setModalView(null)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 border-b border-slate-200 flex items-center gap-4 flex-wrap">
              <select value={liquidationBarrio} onChange={e => setLiquidationBarrio(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Todos los barrios</option>
                {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-4 text-sm">
                <span className="text-slate-600">Bruto: <strong>${liquidationTotals.bruto.toFixed(2)}</strong></span>
                {liquidationTotals.descuento > 0 && <span className="text-emerald-600">Desc: <strong>-${liquidationTotals.descuento.toFixed(2)}</strong></span>}
                <span className="text-amber-700 font-bold">Final: ${liquidationTotals.final.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Barrio</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Lote</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Bruto</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Desc. Tenis</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Final</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-600">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidationData.map((r, i) => {
                    const lotKey = `${r.barrio}-${r.lot}`;
                    const isExpanded = expandedLot === lotKey;
                    return (
                      <>
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3">{r.barrio}</td>
                          <td className="py-2 px-3">{r.lot}</td>
                          <td className="py-2 px-3 text-right">${r.calc.total_bruto.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-emerald-600">{r.calc.total_descuento > 0 ? `-$${r.calc.total_descuento.toFixed(2)}` : '-'}</td>
                          <td className="py-2 px-3 text-right font-medium">${r.calc.total_final.toFixed(2)}</td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => setExpandedLot(isExpanded ? null : lotKey)} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                              {isExpanded ? 'Ocultar' : 'Ver'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && r.calc.details.map((d, di) => (
                          <tr key={`${i}-${di}`} className="bg-slate-50 border-b border-slate-100">
                            <td className="py-1 px-3 pl-8 text-xs text-slate-500" colSpan={2}>
                              {d.socio_name} <span className="text-slate-400">({categoryLabel(d.category)})</span>
                              {d.tiene_tenis && <span className="ml-1 text-cyan-600">TENIS</span>}
                            </td>
                            <td className="py-1 px-3 text-right text-xs">${d.base_price.toFixed(2)}</td>
                            <td className="py-1 px-3 text-right text-xs text-emerald-600">{d.discount > 0 ? `-$${d.discount.toFixed(2)}` : '-'}</td>
                            <td className="py-1 px-3 text-right text-xs font-medium">${d.final_price.toFixed(2)}</td>
                            <td></td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                  {liquidationData.length > 0 && (
                    <tr className="bg-amber-50 font-bold">
                      <td className="py-2 px-3"></td>
                      <td className="py-2 px-3">TOTAL</td>
                      <td className="py-2 px-3 text-right">${liquidationTotals.bruto.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-emerald-700">{liquidationTotals.descuento > 0 ? `-$${liquidationTotals.descuento.toFixed(2)}` : '-'}</td>
                      <td className="py-2 px-3 text-right text-amber-700">${liquidationTotals.final.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
              {liquidationData.length === 0 && <p className="text-center text-slate-500 py-8">No hay datos para mostrar. Configura los precios del carnet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {modalView === 'import' && (
        <SociosImporter
          barrios={barrios}
          onClose={() => setModalView(null)}
          onImportComplete={loadData}
        />
      )}
    </div>
  );
}
