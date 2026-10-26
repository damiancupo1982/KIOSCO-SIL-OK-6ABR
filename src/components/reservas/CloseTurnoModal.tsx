import { useEffect, useState } from 'react';
import { CreditCard, GraduationCap, Loader2, X } from 'lucide-react';
import { supabase, CourtSession, Professor, SaleItem, Shift } from '../../lib/supabase';
import { EMPTY_PAYMENTS, PaymentAmounts, preparePayments, processSale } from '../../lib/processSale';
import PaymentFields from '../PaymentFields';
import { courtLabel, money } from './reservasUtils';

interface CloseTurnoModalProps {
  session: CourtSession;
  items: SaleItem[];
  shift: Shift;
  onClose: () => void;
  onPaid: (saleNumber: string) => void;
}

export default function CloseTurnoModal({ session, items, shift, onClose, onPaid }: CloseTurnoModalProps) {
  const [saleItems, setSaleItems] = useState<SaleItem[]>(items);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [classProductIds, setClassProductIds] = useState<Set<string>>(new Set());
  const total = saleItems.reduce((s, i) => s + i.subtotal, 0);
  const [amounts, setAmounts] = useState<PaymentAmounts>({ ...EMPTY_PAYMENTS, efectivo: total });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClassProducts = async () => {
      const productIds = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean)));
      const [{ data: professorData }, { data: products }] = await Promise.all([
        supabase.from('professors').select('*').eq('active', true).order('name'),
        supabase.from('products').select('id, requires_professor').in('id', productIds),
      ]);
      setProfessors((professorData || []) as Professor[]);
      const classIds = new Set((products || []).filter((product) => product.requires_professor).map((product) => product.id));
      setClassProductIds(classIds);
      if (session.professor_id) {
        setSaleItems(items.map((item) => classIds.has(item.product_id) ? { ...item, professor_id: session.professor_id, professor_name: session.professor_name } : item));
      }
    };
    loadClassProducts();
  }, [items, session.professor_id, session.professor_name]);

  const setItemProfessor = (index: number, professorId: string) => {
    const professor = professors.find((item) => item.id === professorId);
    setSaleItems((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      professor_id: professorId || null,
      professor_name: professor?.name || null,
    } : item));
  };

  const handleConfirm = async () => {
    if (processing) return;
    setError('');
    const missingProfessor = saleItems.find((item) => classProductIds.has(item.product_id) && !item.professor_id);
    if (missingProfessor) return setError(`Seleccioná el profesor para ${missingProfessor.product_name}.`);

    const prepared = preparePayments(amounts, total, session.titular_name, session.titular_lot);
    if ('error' in prepared) return setError(prepared.error);

    if (
      amounts.cuenta_corriente > 0.009 &&
      !window.confirm(`Esta deuda se cargará a:\n${session.titular_name}\nLote ${session.titular_lot}\n¿Confirmar?`)
    ) {
      return;
    }

    setProcessing(true);
    const result = await processSale({
      shift,
      items: saleItems,
      payments: prepared.payments,
      customerName: session.titular_name,
      customerLot: session.titular_lot,
      courtSessionId: session.id,
    });
    setProcessing(false);
    if (!result.ok) return setError(result.error);
    onPaid(result.saleNumber);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Cobrar turno #{session.session_number}</h3>
            <p className="text-xs text-slate-500">
              {courtLabel(session.court)} · Titular: {session.titular_name} (Lote {session.titular_lot || '-'})
            </p>
          </div>
          <button onClick={onClose} disabled={processing} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {saleItems.map((item, index) => classProductIds.has(item.product_id) && (
            <div key={`${item.product_id}-${index}`} className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap size={17} className="text-amber-700" />
                <span className="text-sm font-bold text-slate-800">{item.product_name}</span>
              </div>
              <select
                value={item.professor_id || ''}
                onChange={(e) => setItemProfessor(index, e.target.value)}
                className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg bg-white text-sm text-slate-700 focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Seleccionar profesor *</option>
                {professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>{professor.name}</option>
                ))}
              </select>
              {!item.professor_id && <p className="text-xs text-amber-700 font-semibold mt-2">Es obligatorio seleccionar un profesor.</p>}
            </div>
          ))}

          <PaymentFields
            amounts={amounts}
            onChange={(method, amount) => setAmounts((prev) => ({ ...prev, [method]: amount }))}
          />
          {amounts.cuenta_corriente > 0.009 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              La cuenta corriente se carga siempre al titular del turno.
            </p>
          )}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 flex justify-between items-center border-2 border-emerald-300">
            <span className="text-lg font-bold text-slate-800">Total</span>
            <span className="text-3xl font-bold text-emerald-600">{money(total)}</span>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100">
          <button
            onClick={handleConfirm}
            disabled={processing || (classProductIds.size > 0 && saleItems.some((item) => classProductIds.has(item.product_id) && !item.professor_id))}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold shadow-lg transition-all"
          >
            {processing ? <Loader2 size={22} className="animate-spin" /> : <CreditCard size={22} />}
            Completar venta y cerrar turno
          </button>
        </div>
      </div>
    </div>
  );
}
