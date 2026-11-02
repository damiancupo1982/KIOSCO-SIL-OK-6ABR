import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { MethodBalances } from '../lib/cashBalances';
import { Eraser, Lock, X } from 'lucide-react';

type ZeroMethod = keyof MethodBalances;

const METHOD_OPTIONS: { value: ZeroMethod; label: string }[] = [
  { value: 'transferencia', label: 'Transferencias' },
  { value: 'qr', label: 'QR' },
  { value: 'expensas', label: 'Expensas' },
];

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'La clave de superadministrador no es correcta.',
  negative_balance: 'Este saldo está en negativo, así que no se puede dejar en 0 con un egreso.',
  no_open_shift: 'No hay un turno abierto para registrar el movimiento.',
};

const GENERIC_ERROR = 'No se pudo registrar el movimiento. Intentá de nuevo.';

interface ZeroBalanceModalProps {
  balances: MethodBalances;
  onClose: () => void;
  onDone: () => void;
}

const formatMoney = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ZeroBalanceModal({ balances, onClose, onDone }: ZeroBalanceModalProps) {
  const [method, setMethod] = useState<ZeroMethod>('transferencia');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBalance = balances[method];
  const canZero = selectedBalance > 0 && key.length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canZero) return;

    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('zero_cash_method_balance', {
      p_payment_method: method,
      p_superadmin_key: key,
    });
    setLoading(false);

    if (rpcError) {
      console.error('zero_cash_method_balance failed', rpcError);
      const code = Object.keys(ERROR_MESSAGES).find((c) => rpcError.message.includes(c));
      setError(code ? ERROR_MESSAGES[code] : GENERIC_ERROR);
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 rounded-t-2xl flex items-center justify-between">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Eraser size={24} />
            Valores a 0
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/90 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <p className="block text-sm font-semibold text-slate-700 mb-2">Qué valor querés dejar en 0</p>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={method === option.value}
                  onClick={() => {
                    setMethod(option.value);
                    setError(null);
                  }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    method === option.value
                      ? 'border-amber-500 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Saldo actual</span>
            <span className={`text-xl font-bold ${selectedBalance >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {formatMoney(selectedBalance)}
            </span>
          </div>

          {selectedBalance < 0 && (
            <p className="text-sm text-red-600">Este saldo está en negativo. Un egreso no puede dejarlo en 0.</p>
          )}
          {selectedBalance === 0 && <p className="text-sm text-slate-500">Este valor ya está en 0.</p>}

          <div>
            <label htmlFor="zero-balance-key" className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Lock size={16} />
              Clave de superadministrador
            </label>
            <input
              id="zero-balance-key"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none text-lg font-semibold tracking-widest"
              placeholder="••••••"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canZero}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold shadow-lg transition-all hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Registrando...' : 'Poner en 0'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
