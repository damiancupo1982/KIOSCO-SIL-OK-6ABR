import type { LateStatus } from './bookingControl';

interface LateBookingWarningProps {
  status: LateStatus;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONTENT: Record<LateStatus, { title: string; body: string[]; accent: string; button: string; action: string }> = {
  carga_tardia: {
    title: 'Reserva fuera de tiempo',
    body: [
      'Esta reserva se está cargando fuera del plazo permitido. Recordá registrar las reservas al momento del ingreso de los jugadores.',
      'RECORDA QUE ES MUY IMPORTANTE QUE LAS RESERVAS SE HAGAN EN EL MOMENTO, LA CARGA TARDIA PUEDE TENER ERRORES Y OMISIONES.',
    ],
    accent: 'border-orange-500',
    button: 'bg-orange-600 hover:bg-orange-700',
    action: 'ENTENDIDO — REGISTRAR RESERVA FUERA DE TIEMPO',
  },
  carga_fuera_de_fecha: {
    title: 'Reserva de un día anterior',
    body: [
      'ATENCIÓN: Estás registrando una reserva correspondiente a un día anterior. Esta práctica perjudica el control y la contabilidad del negocio. Las reservas deben registrarse el mismo día.',
    ],
    accent: 'border-red-600',
    button: 'bg-red-600 hover:bg-red-700',
    action: 'ENTENDIDO — REGISTRAR RESERVA FUERA DE FECHA',
  },
};

export default function LateBookingWarning({ status, onConfirm, onCancel }: LateBookingWarningProps) {
  const content = CONTENT[status];
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[60] p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border-t-4 ${content.accent}`}>
        <h4 className="text-lg font-bold text-slate-800">{content.title}</h4>
        <div className="space-y-2">
          {content.body.map((paragraph) => (
            <p key={paragraph} className="text-sm text-slate-600 leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className={`w-full py-3 rounded-xl text-white font-bold transition-colors ${content.button}`}
          >
            {content.action}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold transition-colors"
          >
            Volver y corregir
          </button>
        </div>
      </div>
    </div>
  );
}
