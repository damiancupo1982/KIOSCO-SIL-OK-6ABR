import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { CarnetStatus, Socio, socioFullName } from './types';

interface StatusChangeModalProps {
  socio: Socio;
  target: CarnetStatus;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

const COPY: Record<CarnetStatus, { title: string; button: string; tone: string }> = {
  baja: { title: 'Dar de baja carnet', button: 'Dar de baja', tone: 'bg-red-600 hover:bg-red-700' },
  pausado: { title: 'Pausar carnet', button: 'Pausar', tone: 'bg-amber-600 hover:bg-amber-700' },
  activo: { title: 'Reactivar carnet', button: 'Reactivar', tone: 'bg-emerald-600 hover:bg-emerald-700' },
};

export default function StatusChangeModal({ socio, target, onClose, onConfirm }: StatusChangeModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const name = socioFullName(socio);
  const copy = COPY[target];

  const message =
    target === 'baja'
      ? [`Está por dar de baja el carnet de ${name}.`, 'Esta acción quedará registrada en el historial.', '¿Desea continuar?']
      : target === 'pausado'
      ? [`Está por pausar el carnet de ${name}.`, '¿Desea continuar?']
      : [`Está por reactivar el carnet de ${name}.`, 'Esta acción quedará registrada en el historial.', '¿Desea continuar?'];

  const submit = async () => {
    setSaving(true);
    await onConfirm(reason);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">{copy.title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <AlertTriangle size={22} className={target === 'activo' ? 'text-emerald-600 shrink-0' : 'text-amber-600 shrink-0'} />
            <div className="space-y-1 text-sm text-slate-700 leading-relaxed">
              {message.map(line => <p key={line}>{line}</p>)}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo (opcional)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${copy.tone}`}>
            {saving && <Loader2 size={16} className="animate-spin" />} {copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}
