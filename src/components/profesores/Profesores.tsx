import { useState, useEffect } from 'react';
import { supabase, Professor } from '../../lib/supabase';
import { Search, Plus, Edit2, Trash2, GraduationCap, Phone, Mail, Percent, CheckCircle, XCircle, Save, X, Loader2 } from 'lucide-react';

const inputClass =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent transition';

const labelClass = 'block text-sm font-semibold text-slate-700 mb-1.5';

export default function Profesores() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Professor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    commission_rate: '0',
    active: true,
    notes: '',
  });

  useEffect(() => {
    loadProfessors();
  }, []);

  const loadProfessors = async () => {
    const { data } = await supabase.from('professors').select('*').order('name');
    setProfessors((data || []) as Professor[]);
  };

  const filtered = professors.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditing(null);
    setFormData({ name: '', phone: '', email: '', commission_rate: '0', active: true, notes: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (professor: Professor) => {
    setEditing(professor);
    setFormData({
      name: professor.name,
      phone: professor.phone,
      email: professor.email,
      commission_rate: professor.commission_rate.toString(),
      active: professor.active,
      notes: professor.notes,
    });
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return setError('El nombre es obligatorio.');
    const rate = parseFloat(formData.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) return setError('La comisión debe ser un porcentaje entre 0 y 100.');

    setSaving(true);
    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      commission_rate: rate,
      active: formData.active,
      notes: formData.notes.trim(),
    };

    if (editing) {
      const { error: updateError } = await supabase
        .from('professors')
        .update(payload)
        .eq('id', editing.id);
      setSaving(false);
      if (updateError) return setError('No se pudo actualizar el profesor.');
    } else {
      const { error: insertError } = await supabase
        .from('professors')
        .insert([payload]);
      setSaving(false);
      if (insertError) return setError('No se pudo crear el profesor.');
    }

    await loadProfessors();
    closeModal();
  };

  const toggleActive = async (professor: Professor) => {
    const newActive = !professor.active;
    await supabase.from('professors').update({ active: newActive }).eq('id', professor.id);
    setProfessors(professors.map((p) => (p.id === professor.id ? { ...p, active: newActive } : p)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar profesor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 transition"
          />
        </div>
        <button
          onClick={openNew}
          className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all hover:scale-105"
        >
          <Plus size={20} /> Nuevo Profesor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((professor) => (
          <div
            key={professor.id}
            className={`bg-white rounded-2xl shadow-md border-2 transition-all hover:shadow-lg ${
              professor.active ? 'border-slate-200' : 'border-slate-100 opacity-60'
            }`}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    professor.active ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <GraduationCap size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{professor.name}</h3>
                    <span className={`text-xs font-semibold ${
                      professor.active ? 'text-emerald-600' : 'text-slate-400'
                    }`}>
                      {professor.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(professor)}
                    className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => toggleActive(professor)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      professor.active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'
                    }`}
                    title={professor.active ? 'Desactivar' : 'Activar'}
                  >
                    {professor.active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                {professor.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone size={14} className="text-slate-400" />
                    {professor.phone}
                  </div>
                )}
                {professor.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail size={14} className="text-slate-400" />
                    {professor.email}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Percent size={14} className="text-slate-400" />
                  <span className="text-slate-800 font-bold">{professor.commission_rate}%</span>
                  <span className="text-xs text-slate-400">comisión</span>
                </div>
                {professor.notes && (
                  <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg p-2">{professor.notes}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <GraduationCap className="mx-auto text-slate-400 mb-4" size={64} />
          <h3 className="text-xl font-bold text-slate-700">No hay profesores</h3>
          <p className="text-slate-500">Agregá profesores para comenzar a registrar clases</p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                  <GraduationCap size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  {editing ? 'Editar Profesor' : 'Nuevo Profesor'}
                </h3>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className={labelClass}>Nombre *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Teléfono</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Porcentaje de comisión *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    required
                    value={formData.commission_rate}
                    onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                    className={inputClass}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Porcentaje que se aplica al monto cobrado de cada clase.</p>
              </div>

              <div>
                <label className={labelClass}>Notas (opcional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, active: !formData.active })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    formData.active ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      formData.active ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
                <span className="text-sm font-semibold text-slate-700">
                  {formData.active ? 'Activo' : 'Inactivo'}
                </span>
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold rounded-xl hover:from-sky-600 hover:to-blue-700 shadow-lg transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
