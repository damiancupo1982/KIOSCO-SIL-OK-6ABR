import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  active: boolean;
  requires_professor: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  sale_number: string;
  user_id: string;
  user_name: string;
  shift_id: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  customer_name?: string;
  customer_lot?: string;
  payments?: { method: string; amount: number }[];
  created_at: string;
}

export interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  professor_id?: string | null;
  professor_name?: string | null;
}

export interface CashTransaction {
  id: string;
  shift_id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  payment_method: string;
  description: string;
  created_at: string;
}

export interface Shift {
  id: string;
  user_id: string;
  user_name: string;
  start_date: string;
  end_date: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_sales: number;
  total_expenses: number;
  active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  full_name: string;
  role: 'admin' | 'vendedor';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Configuration {
  id: string;
  business_name: string;
  address: string;
  phone: string;
  tax_id: string;
  currency: string;
  receipt_message: string;
  updated_at: string;
}

export interface CustomerAccount {
  id: string;
  customer_name: string;
  customer_lot: string;
  total_debt: number;
  created_at: string;
  updated_at: string;
}

export interface CurrentAccountTransaction {
  id: string;
  customer_account_id: string;
  customer_name: string;
  customer_lot: string;
  type: 'cargo' | 'pago';
  amount: number;
  balance_after: number;
  sale_id?: string;
  sale_number?: string;
  payment_method?: string;
  description: string;
  user_name: string;
  shift_id?: string;
  created_at: string;
}

export interface CourtPlayer {
  lot: string;
  name: string;
  socio_id: string | null;
  is_socio: boolean;
}

export interface CourtReservation {
  id: string;
  court: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  event_type: 'reserva' | 'clase' | 'torneo' | 'mantenimiento';
  event_group: string;
  title: string;
  professor: string;
  professor_id: string | null;
  student: string;
  titular_lot: string;
  titular_name: string;
  notes: string;
  status: 'reservada' | 'abierta' | 'cerrada' | 'cancelada';
  session_id: string | null;
  created_by: string;
  created_at: string;
}

export interface CourtSession {
  id: string;
  session_number: number;
  court: number;
  reservation_id: string | null;
  status: 'abierta' | 'cerrada' | 'cancelada';
  opened_at: string;
  closed_at: string | null;
  players: CourtPlayer[];
  titular_name: string;
  titular_lot: string;
  titular_socio_id: string | null;
  total: number;
  payment_method: string | null;
  sale_id: string | null;
  opened_by: string;
  closed_by: string;
  guest_charge_manual: boolean;
  is_late_entry: boolean;
  planned_end: string | null;
  event_type: 'reserva' | 'clase' | 'torneo' | 'mantenimiento';
  professor_id: string | null;
  professor_name: string;
}

export interface Professor {
  id: string;
  name: string;
  phone: string;
  email: string;
  commission_rate: number;
  active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProfessorClass {
  id: string;
  professor_id: string;
  professor_name: string;
  product_id: string | null;
  product_name: string;
  sale_id: string | null;
  sale_number: string;
  court_session_id: string | null;
  court: number | null;
  class_date: string;
  class_time: string | null;
  quantity: number;
  gross_amount: number;
  collected_amount: number;
  commission_rate: number;
  commission_amount: number;
  collection_status: 'pendiente' | 'pagada' | 'anulada';
  settlement_status: 'pendiente' | 'liquidada' | 'anulada';
  settlement_id: string | null;
  created_at: string;
}

export interface ProfessorSettlement {
  id: string;
  settlement_number: number;
  professor_id: string;
  professor_name: string;
  period_from: string;
  period_to: string;
  total_gross: number;
  total_commission: number;
  total_paid: number;
  status: 'pendiente_pago' | 'pagada_parcial' | 'pagada' | 'anulada';
  created_by: string;
  created_at: string;
}

export interface ProfessorSettlementPayment {
  id: string;
  settlement_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'efectivo' | 'transferencia';
  notes: string;
  user_name: string;
  created_at: string;
}

export interface CourtSessionItem {
  id: string;
  session_id: string;
  product_id: string | null;
  kind: 'producto' | 'invitado';
  product_name: string;
  price: number;
  quantity: number;
  created_at: string;
}
