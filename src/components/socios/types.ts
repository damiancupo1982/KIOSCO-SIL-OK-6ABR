export interface Barrio {
  id: string;
  name: string;
}

export type TipoSocio = 'INTERNO' | 'EXTERNO';
export type CarnetStatus = 'activo' | 'pausado' | 'baja';

export interface Socio {
  id: string;
  barrio_id: string | null;
  first_name: string;
  last_name: string;
  lot_number: string;
  dni: string;
  phone: string;
  email: string;
  category: string;
  carnet_status: CarnetStatus;
  tiene_tenis: boolean;
  tipo_socio: TipoSocio;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  barrio?: Barrio | null;
}

export interface CarnetPrices {
  id: string;
  individual_price: number;
  family_price: number;
  adherent_extra_price: number;
}

export type CarnetAction = 'PAUSADO' | 'BAJA' | 'REACTIVADO';

export interface CarnetHistoryEntry {
  id: string;
  socio_id: string;
  socio_name: string;
  lot_number: string;
  external_id: string | null;
  tipo_socio: TipoSocio;
  category: string;
  barrio_id: string | null;
  previous_status: CarnetStatus;
  new_status: CarnetStatus;
  action: CarnetAction;
  reason: string;
  user_name: string;
  created_at: string;
}

export const CATEGORIES = [
  { value: 'titular', label: 'Titular' },
  { value: 'familiar_1', label: 'Familiar 1' },
  { value: 'familiar_2', label: 'Familiar 2' },
  { value: 'familiar_3', label: 'Familiar 3' },
  { value: 'familiar_adherente', label: 'Familiar Adherente' },
];

export const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

export const STATUS_LABEL: Record<CarnetStatus, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  baja: 'Dado de baja',
};

export const STATUS_BADGE: Record<CarnetStatus, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  pausado: 'bg-amber-100 text-amber-700',
  baja: 'bg-red-100 text-red-700',
};

export const ACTION_BADGE: Record<CarnetAction, string> = {
  PAUSADO: 'bg-amber-100 text-amber-800',
  BAJA: 'bg-red-100 text-red-700',
  REACTIVADO: 'bg-emerald-100 text-emerald-700',
};

export const socioFullName = (s: Pick<Socio, 'first_name' | 'last_name'>) => `${s.first_name} ${s.last_name}`.trim();

export const ART_OFFSET = '-03:00';

export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: `${month}-01T00:00:00${ART_OFFSET}`, to: `${next}-01T00:00:00${ART_OFFSET}` };
};

export const currentMonth = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date());

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
