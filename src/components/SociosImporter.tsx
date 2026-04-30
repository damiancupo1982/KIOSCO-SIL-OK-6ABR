import { useState, useRef } from 'react';
import { Upload, X, AlertTriangle, Check, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface Barrio {
  id: string;
  name: string;
}

interface ImportRow {
  lot_number: string;
  category: string;
  last_name: string;
  first_name: string;
  age: string;
  phone: string;
  email: string;
  fecha_entrega: string;
  carnet_status: string;
  tiene_tenis: boolean;
  importe: string;
  importe_descuento: string;
  error?: string;
}

interface ImportSummary {
  total: number;
  titulares: number;
  familiares: number;
  adherentes: number;
  conTenis: number;
  lotes: number;
  errors: number;
}

interface SociosImporterProps {
  barrios: Barrio[];
  onClose: () => void;
  onImportComplete: () => void;
}

const TENIS_TRUE_VALUES = ['si', 'sí', 'yes', 'true', '1'];

function parseTenis(val: unknown): boolean {
  if (!val) return false;
  return TENIS_TRUE_VALUES.includes(String(val).trim().toLowerCase());
}

function parseCategory(val: string): string {
  const v = val.trim().toUpperCase();
  if (v === 'T') return 'titular';
  if (v === 'F1') return 'familiar_1';
  if (v === 'F2') return 'familiar_2';
  if (v === 'F3') return 'familiar_3';
  if (v === 'F4' || v === 'FA' || v.startsWith('F')) return 'familiar_adherente';
  return 'titular';
}

function parseStatus(val: unknown): string {
  if (!val) return 'activo';
  const v = String(val).trim().toLowerCase();
  if (v === 'habilitado' || v === 'activo' || v === 'si' || v === 'sí') return 'activo';
  return 'pausado';
}

function splitName(fullName: string): { last_name: string; first_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { last_name: parts[0] || '', first_name: '' };
  if (parts.length === 2) return { last_name: parts[0], first_name: parts[1] };
  // Try to detect LASTNAME FIRSTNAME pattern (all caps usually)
  // Heuristic: first word(s) in uppercase = last name
  let lastNameParts: string[] = [];
  let firstNameParts: string[] = [];
  let foundFirst = false;
  for (const part of parts) {
    if (!foundFirst && part === part.toUpperCase()) {
      lastNameParts.push(part);
    } else {
      foundFirst = true;
      firstNameParts.push(part);
    }
  }
  if (firstNameParts.length === 0) {
    // Fallback: first word is last name, rest is first name
    return { last_name: parts[0], first_name: parts.slice(1).join(' ') };
  }
  return { last_name: lastNameParts.join(' '), first_name: firstNameParts.join(' ') };
}

export default function SociosImporter({ barrios, onClose, onImportComplete }: SociosImporterProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [selectedBarrio, setSelectedBarrio] = useState('');
  const [newBarrio, setNewBarrio] = useState('');
  const [importError, setImportError] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0, errors: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!jsonData || jsonData.length === 0) {
          setImportError('El archivo no contiene datos');
          return;
        }

        const parsed = parseRows(jsonData as Record<string, unknown>[]);
        setRows(parsed);
        calculateSummary(parsed);
        setStep('preview');
      } catch {
        setImportError('Error al leer el archivo. Verifica que sea un archivo Excel o CSV valido.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const parseRows = (data: Record<string, unknown>[]): ImportRow[] => {
    const headers = Object.keys(data[0] || {});

    const findCol = (keywords: string[]): string | null => {
      return headers.find(h => {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        return keywords.some(k => lower.includes(k));
      }) || null;
    };

    const lotCol = findCol(['lote', 'lot', 'nrolote', 'numerolote']);
    const catCol = findCol(['column', 'columna', 'categoria', 'cat', 'tipo']);
    const nameCol = findCol(['apellido', 'nombre', 'apellidoynombre', 'nombreyapellido', 'name']);
    const ageCol = findCol(['edad', 'age']);
    const phoneCol = findCol(['telefono', 'tel', 'phone', 'celular']);
    const emailCol = findCol(['email', 'correo', 'mail']);
    const fechaCol = findCol(['fecha', 'entrega', 'fechaentrega']);
    const statusCol = findCol(['estado', 'habilitado', 'status']);
    const tenisCol = findCol(['tenis', 'tennis']);
    const importeCol = findCol(['imps', 'impsd', 'importe', 'monto', 'precio']);
    const importeDescCol = findCol(['impc', 'impcde', 'importecondescuento', 'importedesc', 'descuento']);

    return data.map((row) => {
      const lotRaw = lotCol ? String(row[lotCol] || '') : '';
      const catRaw = catCol ? String(row[catCol] || 'T') : 'T';
      const nameRaw = nameCol ? String(row[nameCol] || '') : '';
      const ageRaw = ageCol ? String(row[ageCol] || '') : '';
      const phoneRaw = phoneCol ? String(row[phoneCol] || '') : '';
      const emailRaw = emailCol ? String(row[emailCol] || '') : '';
      const fechaRaw = fechaCol ? String(row[fechaCol] || '') : '';
      const statusRaw = statusCol ? row[statusCol] : 'HABILITADO';
      const tenisRaw = tenisCol ? row[tenisCol] : '';
      const importeRaw = importeCol ? String(row[importeCol] || '') : '';
      const importeDescRaw = importeDescCol ? String(row[importeDescCol] || '') : '';

      const { last_name, first_name } = splitName(nameRaw);
      const category = parseCategory(catRaw);
      const carnet_status = parseStatus(statusRaw);
      const tiene_tenis = parseTenis(tenisRaw);

      let error = '';
      if (!lotRaw) error = 'Falta numero de lote';
      else if (!last_name && !first_name) error = 'Falta nombre';

      return {
        lot_number: lotRaw.trim(),
        category,
        last_name,
        first_name,
        age: ageRaw,
        phone: phoneRaw.toString().trim(),
        email: emailRaw.trim(),
        fecha_entrega: fechaRaw,
        carnet_status,
        tiene_tenis,
        importe: importeRaw,
        importe_descuento: importeDescRaw,
        error,
      };
    }).filter(r => r.lot_number || r.last_name || r.first_name);
  };

  const calculateSummary = (data: ImportRow[]) => {
    const lotes = new Set(data.map(r => r.lot_number).filter(Boolean));
    setSummary({
      total: data.length,
      titulares: data.filter(r => r.category === 'titular').length,
      familiares: data.filter(r => ['familiar_1', 'familiar_2', 'familiar_3'].includes(r.category)).length,
      adherentes: data.filter(r => r.category === 'familiar_adherente').length,
      conTenis: data.filter(r => r.tiene_tenis).length,
      lotes: lotes.size,
      errors: data.filter(r => r.error).length,
    });
  };

  const handleImport = async () => {
    if (!selectedBarrio && !newBarrio.trim()) {
      setImportError('Selecciona o crea un barrio para la importacion');
      return;
    }

    setStep('importing');
    setImportProgress(0);

    let barrioId = selectedBarrio;

    if (newBarrio.trim()) {
      const { data: existingBarrio } = await supabase
        .from('barrios')
        .select('id')
        .eq('name', newBarrio.trim())
        .maybeSingle();

      if (existingBarrio) {
        barrioId = existingBarrio.id;
      } else {
        const { data: created, error } = await supabase
          .from('barrios')
          .insert([{ name: newBarrio.trim() }])
          .select()
          .single();
        if (error || !created) {
          setImportError('Error al crear barrio: ' + (error?.message || ''));
          setStep('preview');
          return;
        }
        barrioId = created.id;
      }
    }

    const validRows = rows.filter(r => !r.error);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Load existing socios to check duplicates
    const { data: existingSocios } = await supabase
      .from('socios')
      .select('id, barrio_id, lot_number, last_name, first_name, dni, category');
    const existing = existingSocios || [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));

      // Check duplicate
      const isDuplicate = existing.some(e =>
        e.barrio_id === barrioId &&
        e.lot_number === row.lot_number &&
        e.last_name.toLowerCase() === row.last_name.toLowerCase() &&
        e.first_name.toLowerCase() === row.first_name.toLowerCase()
      );

      if (isDuplicate) {
        skipped++;
        continue;
      }

      // Validate category uniqueness
      const lotExisting = existing.filter(e => e.barrio_id === barrioId && e.lot_number === row.lot_number);
      const lotImported = validRows.slice(0, i).filter(r => r.lot_number === row.lot_number);
      const allInLot = [...lotExisting.map(e => e.category), ...lotImported.map(r => r.category)];

      if (row.category !== 'familiar_adherente' && allInLot.filter(c => c === row.category).length > 0) {
        if (row.category === 'titular' || row.category === 'familiar_1' || row.category === 'familiar_2' || row.category === 'familiar_3') {
          skipped++;
          continue;
        }
      }

      const { error } = await supabase.from('socios').insert([{
        barrio_id: barrioId,
        first_name: row.first_name,
        last_name: row.last_name,
        lot_number: row.lot_number,
        dni: '',
        phone: row.phone,
        email: row.email,
        category: row.category,
        carnet_status: row.carnet_status,
        tiene_tenis: row.tiene_tenis,
      }]);

      if (error) {
        errors++;
      } else {
        imported++;
        existing.push({
          id: '',
          barrio_id: barrioId,
          lot_number: row.lot_number,
          last_name: row.last_name,
          first_name: row.first_name,
          dni: '',
          category: row.category,
        });
      }
    }

    setImportResult({ imported, skipped, errors });
    setStep('done');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet size={22} className="text-teal-600" />
            Importar desde Excel
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-teal-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={48} className="mx-auto text-slate-400 mb-4" />
                <p className="text-lg font-medium text-slate-700">Arrastra o haz clic para subir un archivo</p>
                <p className="text-sm text-slate-500 mt-2">Formatos aceptados: .xlsx, .csv</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,.xls"
                onChange={handleFile}
                className="hidden"
              />
              {importError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertTriangle size={18} />
                  {importError}
                </div>
              )}
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && summary && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-teal-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-teal-700">{summary.total}</p>
                  <p className="text-xs text-teal-600">Total registros</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{summary.lotes}</p>
                  <p className="text-xs text-blue-600">Lotes</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{summary.titulares}</p>
                  <p className="text-xs text-emerald-600">Titulares</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{summary.familiares + summary.adherentes}</p>
                  <p className="text-xs text-amber-600">Familiares</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-cyan-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-cyan-700">{summary.conTenis}</p>
                  <p className="text-xs text-cyan-600">Con tenis</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-700">{summary.adherentes}</p>
                  <p className="text-xs text-orange-600">Adherentes</p>
                </div>
                {summary.errors > 0 && (
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{summary.errors}</p>
                    <p className="text-xs text-red-600">Con errores</p>
                  </div>
                )}
              </div>

              {/* Barrio selection */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Barrio para esta importacion:</p>
                <select
                  value={selectedBarrio}
                  onChange={e => { setSelectedBarrio(e.target.value); setNewBarrio(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Seleccionar barrio existente...</option>
                  {barrios.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="O escribe un nuevo barrio..."
                  value={newBarrio}
                  onChange={e => { setNewBarrio(e.target.value); setSelectedBarrio(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              {importError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <AlertTriangle size={18} />
                  {importError}
                </div>
              )}

              {/* Preview table */}
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-2 font-semibold">Lote</th>
                      <th className="text-left py-2 px-2 font-semibold">Cat.</th>
                      <th className="text-left py-2 px-2 font-semibold">Apellido</th>
                      <th className="text-left py-2 px-2 font-semibold">Nombre</th>
                      <th className="text-left py-2 px-2 font-semibold">Tel.</th>
                      <th className="text-left py-2 px-2 font-semibold">Tenis</th>
                      <th className="text-left py-2 px-2 font-semibold">Estado</th>
                      <th className="text-left py-2 px-2 font-semibold">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-t border-slate-100 ${r.error ? 'bg-red-50' : ''}`}>
                        <td className="py-1.5 px-2">{r.lot_number}</td>
                        <td className="py-1.5 px-2">{r.category === 'titular' ? 'T' : r.category === 'familiar_1' ? 'F1' : r.category === 'familiar_2' ? 'F2' : r.category === 'familiar_3' ? 'F3' : 'FA'}</td>
                        <td className="py-1.5 px-2">{r.last_name}</td>
                        <td className="py-1.5 px-2">{r.first_name}</td>
                        <td className="py-1.5 px-2">{r.phone}</td>
                        <td className="py-1.5 px-2">{r.tiene_tenis ? 'SI' : 'NO'}</td>
                        <td className="py-1.5 px-2">{r.carnet_status}</td>
                        <td className="py-1.5 px-2 text-red-600">{r.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => { setStep('upload'); setRows([]); setSummary(null); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button onClick={handleImport} className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
                  Importar {summary.total - summary.errors} registros
                </button>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500 mx-auto"></div>
              <p className="text-lg font-medium text-slate-700">Importando socios...</p>
              <div className="w-full bg-slate-200 rounded-full h-2 max-w-md mx-auto">
                <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${importProgress}%` }}></div>
              </div>
              <p className="text-sm text-slate-500">{importProgress}%</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <Check size={32} className="text-emerald-600" />
              </div>
              <p className="text-lg font-bold text-slate-800">Importacion completada</p>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-emerald-700">{importResult.imported}</p>
                  <p className="text-xs text-emerald-600">Importados</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-amber-700">{importResult.skipped}</p>
                  <p className="text-xs text-amber-600">Omitidos</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-red-700">{importResult.errors}</p>
                  <p className="text-xs text-red-600">Errores</p>
                </div>
              </div>
              <button
                onClick={() => { onImportComplete(); onClose(); }}
                className="mt-4 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
