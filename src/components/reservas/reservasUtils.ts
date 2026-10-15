const TZ = 'America/Argentina/Buenos_Aires';

export const COURTS = [0, 1, 2, 3];

export const courtLabel = (court: number) => `Cancha ${court}`;

export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const nowTimeHHMM = () =>
  new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const startOfWeekISO = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDaysISO(iso, -offset);
};

export const formatDateLong = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export const formatDateShort = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });

export const formatTime = (time: string) => time.slice(0, 5);

export const formatClock = (ts: string) =>
  new Date(ts).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDateTime = (ts: string) =>
  new Date(ts).toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatDuration = (fromTs: string, toTs?: string | null) => {
  const ms = Math.max(0, (toTs ? new Date(toTs).getTime() : Date.now()) - new Date(fromTs).getTime());
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};

export const money = (n: number) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const TIME_SLOTS = Array.from({ length: 33 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export const RPC_ERRORS: Record<string, string> = {
  court_already_open: 'Esta cancha ya tiene un turno abierto.',
  reservation_not_available: 'La reserva ya no está disponible (fue abierta o cancelada).',
  titular_required: 'Debe indicar el nombre del titular.',
  invalid_players: 'Debe cargar entre 1 y 4 jugadores.',
  session_not_open: 'Este turno ya fue cerrado.',
  session_has_items: 'El turno tiene consumos: debe cobrarse.',
};

export const rpcErrorMessage = (message: string | undefined) => {
  const key = Object.keys(RPC_ERRORS).find((k) => message?.includes(k));
  return key ? RPC_ERRORS[key] : `Ocurrió un error: ${message ?? 'desconocido'}`;
};
