interface LateBookingWarningProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function LateBookingWarning({ onConfirm, onCancel }: LateBookingWarningProps) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border-t-4 border-orange-500">
        <h4 className="text-lg font-bold text-slate-800">Reserva fuera de tiempo</h4>
        <p className="text-sm text-slate-600 leading-relaxed">
          RECORDA QUE ES MUY IMPORTANTE QUE LAS RESERVAS SE HAGAN EN EL MOMENTO, LA CARGA TARDIA PUEDE TENER ERRORES Y OMISIONES.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold transition-colors"
          >
            ENTENDIDO — REGISTRAR RESERVA FUERA DE TIEMPO
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
