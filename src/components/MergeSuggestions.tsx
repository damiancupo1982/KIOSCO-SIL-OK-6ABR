import { useMemo, useState } from 'react';
import { supabase, CustomerAccount } from '../lib/supabase';
import { Merge, ChevronDown, ChevronUp, ArrowRight, ArrowLeftRight, X, Sparkles } from 'lucide-react';

interface MergeSuggestionsProps {
  accounts: CustomerAccount[];
  onMerged: () => Promise<void> | void;
}

interface Suggestion {
  key: string;
  source: CustomerAccount;
  target: CustomerAccount;
}

const DISMISSED_KEY = 'cc_merge_dismissed';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isUnknownLot = (lot: string) => /^[0\s-]*$/.test(lot);

const levenshtein = (a: string, b: string) => {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

const tokensMatch = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) ||
  (Math.min(a.length, b.length) >= 4 && levenshtein(a, b) <= 1);

const namesSimilar = (a: string, b: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (levenshtein(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.2))) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!short.some((t) => t.length >= 3)) return false;
  return short.every((t) => long.some((l) => tokensMatch(t, l)));
};

const lotsCompatible = (a: string, b: string) =>
  isUnknownLot(a) || isUnknownLot(b) || normalize(a) === normalize(b);

const pickTarget = (a: CustomerAccount, b: CustomerAccount): [CustomerAccount, CustomerAccount] => {
  const score = (x: CustomerAccount) =>
    (isUnknownLot(x.customer_lot) ? 0 : 1000) + x.customer_name.trim().length;
  return score(a) >= score(b) ? [b, a] : [a, b];
};

const loadDismissed = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function MergeSuggestions({ accounts, onMerged }: MergeSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const normalized = accounts.map((a) => ({ account: a, name: normalize(a.customer_name) }));
    const result: Suggestion[] = [];
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        const a = normalized[i];
        const b = normalized[j];
        if (!lotsCompatible(a.account.customer_lot, b.account.customer_lot)) continue;
        if (!namesSimilar(a.name, b.name)) continue;
        const key = [a.account.id, b.account.id].sort().join('|');
        if (dismissed.includes(key)) continue;
        const [source, target] = pickTarget(a.account, b.account);
        result.push({ key, source, target });
      }
    }
    return result;
  }, [accounts, dismissed]);

  if (suggestions.length === 0) return null;

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  const merge = async (s: Suggestion) => {
    const [source, target] = swapped[s.key] ? [s.target, s.source] : [s.source, s.target];
    const ok = window.confirm(
      `Se unirá "${source.customer_name}" (Lote ${source.customer_lot || '-'}) dentro de "${target.customer_name}" (Lote ${target.customer_lot || '-'}).\n\nSaldo total: $${(Number(source.total_debt) + Number(target.total_debt)).toFixed(2)}\n\n¿Confirmar?`
    );
    if (!ok) return;
    setMergingKey(s.key);
    const { error } = await supabase.rpc('update_customer_account', {
      p_account_id: source.id,
      p_name: target.customer_name,
      p_lot: target.customer_lot,
    });
    setMergingKey(null);
    if (error) {
      alert('No se pudieron unir las cuentas. Intentá de nuevo.');
      return;
    }
    await onMerged();
  };

  const AccountChip = ({ account, highlight }: { account: CustomerAccount; highlight?: boolean }) => (
    <div
      className={`flex-1 min-w-0 rounded-lg px-3 py-2 border ${
        highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
      }`}
    >
      <p className="font-semibold text-slate-800 truncate">{account.customer_name}</p>
      <p className="text-xs text-slate-500">
        Lote: {account.customer_lot || '-'} · ${Number(account.total_debt).toFixed(2)}
      </p>
    </div>
  );

  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-100/60 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-amber-800">
          <Sparkles size={18} className="text-amber-600" />
          Sugerencias para unir cuentas
          <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {suggestions.length}
          </span>
        </span>
        {open ? <ChevronUp size={20} className="text-amber-700" /> : <ChevronDown size={20} className="text-amber-700" />}
      </button>

      {open && (
        <div className="border-t border-amber-200 p-4 space-y-3 max-h-[420px] overflow-y-auto">
          <p className="text-xs text-amber-700">
            Estas cuentas parecen ser del mismo cliente. La cuenta de la izquierda se une dentro de la de la derecha (en verde). Usá el botón de flechas para invertir.
          </p>
          {suggestions.map((s) => {
            const [source, target] = swapped[s.key] ? [s.target, s.source] : [s.source, s.target];
            return (
              <div key={s.key} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white/70 rounded-xl p-3 border border-amber-100">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <AccountChip account={source} />
                  <ArrowRight size={18} className="text-amber-500 flex-shrink-0" />
                  <AccountChip account={target} highlight />
                </div>
                <div className="flex items-center gap-1 justify-end flex-shrink-0">
                  <button
                    onClick={() => setSwapped({ ...swapped, [s.key]: !swapped[s.key] })}
                    className="p-2 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                    title="Invertir dirección"
                  >
                    <ArrowLeftRight size={18} />
                  </button>
                  <button
                    onClick={() => merge(s)}
                    disabled={mergingKey !== null}
                    className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:from-slate-300 disabled:to-slate-400 text-white rounded-lg text-sm font-medium shadow flex items-center gap-1.5 transition-all"
                  >
                    <Merge size={16} />
                    {mergingKey === s.key ? 'Uniendo...' : 'Unir'}
                  </button>
                  <button
                    onClick={() => dismiss(s.key)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="No son la misma persona"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
