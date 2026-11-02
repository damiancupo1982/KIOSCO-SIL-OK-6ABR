import { supabase } from './supabase';

const PAGE_SIZE = 1000;
const BALANCE_METHODS = ['transferencia', 'qr', 'expensas'];

export type MethodBalances = { transferencia: number; qr: number; expensas: number };

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PageResult<T>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function fetchMethodBalances(): Promise<MethodBalances | null> {
  const rows = await fetchAllRows<{ type: string; payment_method: string; amount: number }>((from, to) =>
    supabase
      .from('cash_transactions')
      .select('type, payment_method, amount')
      .in('payment_method', BALANCE_METHODS)
      .order('id')
      .range(from, to)
  );
  if (!rows) return null;

  const balances: MethodBalances = { transferencia: 0, qr: 0, expensas: 0 };
  rows.forEach((row) => {
    const method = row.payment_method as keyof MethodBalances;
    const amount = Number(row.amount) || 0;
    balances[method] += row.type === 'income' ? amount : -amount;
  });
  return balances;
}
